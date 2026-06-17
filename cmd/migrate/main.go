// Package main is the entry point for the PIXS database migration CLI.
package main

import (
	"fmt"
	"os"

	"pixs/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
		os.Exit(1)
	}
	_ = cfg
	// Atlas migration CLI integration will be added in a future session.
	// Migrations are applied via `atlas migrate apply` in the Makefile.
	fmt.Println("migrate stub — use `make migrate` to apply migrations via Atlas")
}
