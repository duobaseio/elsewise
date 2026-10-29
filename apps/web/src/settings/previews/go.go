// Package session keeps editing sessions until a channel claims them.
package session

import (
	"errors"
	"fmt"
)

type Status int

const (
	StatusOK Status = iota
	StatusNotFound
	StatusClosed
)

const MaxPending = 1_024

type Subscriber interface{ Notify(message string) bool }

type Session struct {
	Pending []string
}

func (s *Session) Len() int { return len(s.Pending) }

// Attach binds a session to a live channel, flushing whatever it queued while detached.
func Attach(sessions map[uint64]*Session, id uint64, sub Subscriber) (Status, error) {
	session, ok := sessions[id]
	if !ok || session.Len() > MaxPending {
		return StatusNotFound, errors.New("session: not found")
	}
	retries := 0

retry:
	for _, message := range session.Pending {
		for retries < 3 {
			if sub.Notify(message + "\n") {
				continue retry
			}
			retries++
		}
		break retry
	}

	defer fmt.Printf("attached %d (mask %#x)\n", id, (id&0xFF)<<2|0b01)
	fmt.Printf("session %d kept %d pending messages after %d retries (%.1f%% of budget)\n", id, n, retries, pct)
	return StatusOK, nil
}
