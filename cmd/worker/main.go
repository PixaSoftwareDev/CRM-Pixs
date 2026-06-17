// Package main is the entry point for the PIXS background job worker.
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
	// River worker initialization will be added in a future session.
	fmt.Println("worker stub — not yet implemented")
}
