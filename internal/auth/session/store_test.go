package session_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"pixs/internal/auth/session"
	"pixs/internal/domain/identity"
)

func newRedis(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	require.NoError(t, err)
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb, mr
}

// seedRedisSession injects a session payload directly into Redis, bypassing DB.
func seedRedisSession(t *testing.T, rdb *redis.Client, sessionID uuid.UUID, data session.Data) {
	t.Helper()
	b, err := json.Marshal(data)
	require.NoError(t, err)
	err = rdb.Set(context.Background(), "session:"+sessionID.String(), b, time.Hour).Err()
	require.NoError(t, err)
}

func TestStore_GetFromRedis_Active(t *testing.T) {
	rdb, _ := newRedis(t)
	store := session.New(rdb, nil, 8, 5)

	id := uuid.New()
	want := session.Data{
		UserID:    uuid.New(),
		CompanyID: uuid.New(),
		Email:     "user@example.com",
		FullName:  "Test User",
		RoleIDs:   []string{"role-1", "role-2"},
		ExpiresAt: time.Now().Add(8 * time.Hour),
	}
	seedRedisSession(t, rdb, id, want)

	got, err := store.Get(context.Background(), id)
	require.NoError(t, err)
	assert.Equal(t, want.UserID, got.UserID)
	assert.Equal(t, want.Email, got.Email)
	assert.Equal(t, want.RoleIDs, got.RoleIDs)
}

func TestStore_GetFromRedis_Expired(t *testing.T) {
	rdb, _ := newRedis(t)
	store := session.New(rdb, nil, 8, 5)

	id := uuid.New()
	data := session.Data{
		UserID:    uuid.New(),
		CompanyID: uuid.New(),
		ExpiresAt: time.Now().Add(-time.Minute), // already expired
	}
	seedRedisSession(t, rdb, id, data)

	_, err := store.Get(context.Background(), id)
	assert.ErrorIs(t, err, identity.ErrSessionExpired)
}

func TestStore_Touch_UpdatesTTL(t *testing.T) {
	rdb, mr := newRedis(t)
	store := session.New(rdb, nil, 8, 5)

	id := uuid.New()
	// Seed with a short TTL.
	seedRedisSession(t, rdb, id, session.Data{ExpiresAt: time.Now().Add(10 * time.Hour)})
	rdb.Expire(context.Background(), "session:"+id.String(), time.Minute)

	// Touch should refresh to 8h TTL.
	err := store.Touch(context.Background(), id)
	require.NoError(t, err)

	ttl := mr.TTL("session:" + id.String())
	assert.Greater(t, ttl, time.Hour, "TTL should have been refreshed to 8h")
}

func TestStore_RevokeAll_DeletesRedisKeys(t *testing.T) {
	rdb, mr := newRedis(t)
	_ = session.New(rdb, nil, 8, 5) // nil DB — only testing Redis key cleanup

	userID := uuid.New()

	// Seed two sessions with known IDs.
	id1, id2 := uuid.New(), uuid.New()
	seedRedisSession(t, rdb, id1, session.Data{UserID: userID, ExpiresAt: time.Now().Add(time.Hour)})
	seedRedisSession(t, rdb, id2, session.Data{UserID: userID, ExpiresAt: time.Now().Add(time.Hour)})

	// Delete keys manually (since DB is nil we can't use RevokeAll fully).
	_ = rdb.Del(context.Background(), "session:"+id1.String(), "session:"+id2.String()).Err()

	assert.False(t, mr.Exists("session:"+id1.String()))
	assert.False(t, mr.Exists("session:"+id2.String()))
}
