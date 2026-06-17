// Package session manages user sessions stored in Redis (fast reads) and
// mirrored to PostgreSQL (persistent record for listing and revocation).
package session

import (
	"context"
	"encoding/json"
	"fmt"
	"net/netip"
	"time"

	"github.com/cockroachdb/errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"pixs/internal/domain/identity"
	sqlcgen "pixs/internal/repository/sqlc"
)

const redisKeyPrefix = "session:"

// Data is the session payload stored in Redis.
type Data struct {
	UserID    uuid.UUID `json:"user_id"`
	CompanyID uuid.UUID `json:"company_id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	RoleIDs   []string  `json:"role_ids"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Store manages sessions across Redis and PostgreSQL.
type Store struct {
	rdb        *redis.Client
	db         *pgxpool.Pool
	q          *sqlcgen.Queries
	ttl        time.Duration
	maxPerUser int
}

// New creates a new session Store.
func New(rdb *redis.Client, db *pgxpool.Pool, ttlHours, maxPerUser int) *Store {
	return &Store{
		rdb:        rdb,
		db:         db,
		q:          sqlcgen.New(db),
		ttl:        time.Duration(ttlHours) * time.Hour,
		maxPerUser: maxPerUser,
	}
}

// Create creates a new session in both Redis and PostgreSQL.
// If the user already has maxPerUser active sessions, the oldest is revoked.
func (s *Store) Create(ctx context.Context, user *identity.User, roleIDs []string, ip, userAgent string) (uuid.UUID, error) {
	count, err := s.q.CountActiveSessions(ctx, user.ID)
	if err != nil {
		return uuid.Nil, errors.Wrap(err, "counting active sessions")
	}
	if int(count) >= s.maxPerUser {
		oldest, err := s.q.GetOldestActiveSession(ctx, user.ID)
		if err != nil {
			return uuid.Nil, errors.Wrap(err, "getting oldest session")
		}
		if err := s.revokeFromBoth(ctx, oldest.ID); err != nil {
			return uuid.Nil, errors.Wrap(err, "revoking oldest session")
		}
	}

	expiresAt := time.Now().Add(s.ttl)

	var ipAddr *netip.Addr
	if ip != "" {
		addr, parseErr := netip.ParseAddr(ip)
		if parseErr == nil {
			ipAddr = &addr
		}
	}
	var ua *string
	if userAgent != "" {
		ua = &userAgent
	}

	dbSession, err := s.q.CreateSession(ctx, sqlcgen.CreateSessionParams{
		UserID:    user.ID,
		CompanyID: user.CompanyID,
		IpAddress: ipAddr,
		UserAgent: ua,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return uuid.Nil, errors.Wrap(err, "creating session in db")
	}

	data := Data{
		UserID:    user.ID,
		CompanyID: user.CompanyID,
		Email:     user.Email.String(),
		FullName:  user.FullName,
		RoleIDs:   roleIDs,
		ExpiresAt: expiresAt,
	}
	if err := s.setRedis(ctx, dbSession.ID, data); err != nil {
		_ = s.q.RevokeSession(ctx, dbSession.ID)
		return uuid.Nil, errors.Wrap(err, "storing session in redis")
	}

	return dbSession.ID, nil
}

// Get retrieves session data from Redis. Falls back to DB on cache miss
// (handles Redis restarts). Returns ErrSessionNotFound / ErrSessionExpired /
// ErrSessionRevoked as appropriate.
func (s *Store) Get(ctx context.Context, sessionID uuid.UUID) (*Data, error) {
	data, err := s.getRedis(ctx, sessionID)
	if err == nil {
		if time.Now().After(data.ExpiresAt) {
			return nil, identity.ErrSessionExpired
		}
		return data, nil
	}
	if !errors.Is(err, redis.Nil) {
		return nil, errors.Wrap(err, "reading session from redis")
	}

	// Cache miss — check DB.
	dbSess, err := s.q.GetSessionByID(ctx, sessionID)
	if err != nil {
		return nil, identity.ErrSessionNotFound
	}
	if dbSess.RevokedAt.Valid {
		return nil, identity.ErrSessionRevoked
	}
	if time.Now().After(dbSess.ExpiresAt.Time) {
		return nil, identity.ErrSessionExpired
	}

	// Role IDs are not stored in DB — caller must reload permissions.
	rebuilt := &Data{
		UserID:    dbSess.UserID,
		CompanyID: dbSess.CompanyID,
		ExpiresAt: dbSess.ExpiresAt.Time,
	}
	return rebuilt, nil
}

// Touch refreshes the TTL in Redis and updates last_seen_at in DB.
func (s *Store) Touch(ctx context.Context, sessionID uuid.UUID) error {
	key := redisKey(sessionID)
	if err := s.rdb.Expire(ctx, key, s.ttl).Err(); err != nil {
		return errors.Wrap(err, "refreshing session ttl in redis")
	}
	if s.db != nil {
		_ = s.q.UpdateSessionLastSeen(ctx, sessionID)
	}
	return nil
}

// Revoke invalidates a session in both Redis and PostgreSQL.
func (s *Store) Revoke(ctx context.Context, sessionID uuid.UUID) error {
	return s.revokeFromBoth(ctx, sessionID)
}

// RevokeAll invalidates all active sessions for a user.
func (s *Store) RevokeAll(ctx context.Context, userID uuid.UUID) error {
	sessions, err := s.q.ListActiveSessions(ctx, userID)
	if err != nil {
		return errors.Wrap(err, "listing active sessions")
	}
	for _, sess := range sessions {
		_ = s.rdb.Del(ctx, redisKey(sess.ID)).Err()
	}
	return s.q.RevokeAllUserSessions(ctx, userID)
}

// ListActive returns all non-revoked sessions for a user from the database.
func (s *Store) ListActive(ctx context.Context, userID uuid.UUID) ([]identity.Session, error) {
	rows, err := s.q.ListActiveSessions(ctx, userID)
	if err != nil {
		return nil, errors.Wrap(err, "listing sessions")
	}
	out := make([]identity.Session, 0, len(rows))
	for _, r := range rows {
		out = append(out, sessionFromRow(r))
	}
	return out, nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (s *Store) revokeFromBoth(ctx context.Context, id uuid.UUID) error {
	_ = s.rdb.Del(ctx, redisKey(id)).Err()
	return s.q.RevokeSession(ctx, id)
}

func (s *Store) setRedis(ctx context.Context, id uuid.UUID, data Data) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, redisKey(id), b, s.ttl).Err()
}

func (s *Store) getRedis(ctx context.Context, id uuid.UUID) (*Data, error) {
	b, err := s.rdb.Get(ctx, redisKey(id)).Bytes()
	if err != nil {
		return nil, err
	}
	var data Data
	if err := json.Unmarshal(b, &data); err != nil {
		return nil, err
	}
	return &data, nil
}

func redisKey(id uuid.UUID) string {
	return fmt.Sprintf("%s%s", redisKeyPrefix, id.String())
}

func sessionFromRow(r sqlcgen.Session) identity.Session {
	var ip string
	if r.IpAddress != nil {
		ip = r.IpAddress.String()
	}
	var ua string
	if r.UserAgent != nil {
		ua = *r.UserAgent
	}
	sess := identity.Session{
		ID:         r.ID,
		UserID:     r.UserID,
		CompanyID:  r.CompanyID,
		IPAddress:  ip,
		UserAgent:  ua,
		CreatedAt:  r.CreatedAt.Time,
		LastSeenAt: r.LastSeenAt.Time,
		ExpiresAt:  r.ExpiresAt.Time,
	}
	if r.RevokedAt.Valid {
		t := r.RevokedAt.Time
		sess.RevokedAt = &t
	}
	return sess
}
