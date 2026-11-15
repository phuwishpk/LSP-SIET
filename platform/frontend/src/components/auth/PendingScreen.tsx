'use client'

/**
 * PendingScreen has been superseded by AccessDeniedScreen based on advisor feedback:
 * Non-030 and external accounts are immediately denied, and pending status is removed.
 */
import { AccessDeniedScreen } from './AccessDeniedScreen'

export function PendingScreen() {
  return <AccessDeniedScreen />
}
