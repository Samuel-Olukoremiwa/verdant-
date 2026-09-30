'use client'

import {
  useState,
} from 'react'

type Result = {
  invoicesChecked:
    number

  residentsEligible:
    number

  emailsQueued:
    number

  smsQueued:
    number

  skippedNoEmail:
    number

  skippedNoPhone:
    number

  emailsSent:
    number

  emailsFailed:
    number

  smsAccepted:
    number

  smsFailed:
    number

  smsUnknown:
    number

  processed:
    number

  pending:
    number
}

export function SendRemindersButton() {
  const [
    loading,
    setLoading,
  ] =
    useState(
      false
    )

  const [
    result,
    setResult,
  ] =
    useState<
      Result | null
    >(
      null
    )

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    )

  async function handleClick() {
    setLoading(
      true
    )

    setError(
      null
    )

    setResult(
      null
    )

    try {
      const response =
        await fetch(
          '/api/reminders/send',
          {
            method:
              'POST',
          }
        )

      const data =
        await response.json()

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            'Failed to send reminders'
        )
      }

      setResult(
        data
      )
    } catch (
      err
    ) {
      setError(
        err instanceof
          Error
          ? err.message
          : 'Something went wrong'
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  return (
    <div>
      <button
        onClick={
          handleClick
        }
        disabled={
          loading
        }
        className="action secondary"
      >
        {loading
          ? 'Queueing reminders...'
          : 'Send email & SMS reminders'}
      </button>

      {result && (
        <p className="text-xs text-green-700 mt-2">
          Checked{' '}
          {
            result.invoicesChecked
          }{' '}
          due/overdue invoice
          {result.invoicesChecked ===
          1
            ? ''
            : 's'}
          {' · '}
          {
            result.residentsEligible
          }{' '}
          resident
          {result.residentsEligible ===
          1
            ? ''
            : 's'}{' '}
          required a reminder.
          {' '}
          Newly queued:
          {' '}
          {
            result.emailsQueued
          }{' '}
          email
          {result.emailsQueued ===
          1
            ? ''
            : 's'}
          {' and '}
          {
            result.smsQueued
          }{' '}
          SMS.
          {' '}
          Sent immediately:
          {' '}
          {
            result.emailsSent
          }{' '}
          email
          {result.emailsSent ===
          1
            ? ''
            : 's'}
          {' and '}
          {
            result.smsAccepted
          }{' '}
          SMS.
          {result.pending >
          0
            ? ` ${result.pending} notification${
                result.pending ===
                1
                  ? ''
                  : 's'
              } remain safely queued for background delivery.`
            : ''}
          {result.emailsFailed >
            0 ||
          result.smsFailed >
            0 ||
          result.smsUnknown >
            0
            ? ` Delivery issues: ${result.emailsFailed} email failed, ${result.smsFailed} SMS failed, ${result.smsUnknown} SMS outcome unknown.`
            : ''}
          {result.skippedNoEmail >
          0
            ? ` ${result.skippedNoEmail} resident${
                result.skippedNoEmail ===
                1
                  ? ''
                  : 's'
              } had no email.`
            : ''}
          {result.skippedNoPhone >
          0
            ? ` ${result.skippedNoPhone} resident${
                result.skippedNoPhone ===
                1
                  ? ''
                  : 's'
              } had no phone number.`
            : ''}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}
    </div>
  )
}