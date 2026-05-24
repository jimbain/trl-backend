# Customer-Facing Messages

The complete list of messages a customer (end-user / listener) can see in the TRL app. Internal admin workflows (user management, CSV import/export, etc.) are **not** included.

Each entry shows:
- **When they see it** — what the customer was trying to do
- **What they see** — the exact message text

`${things in curly braces}` are placeholders filled in at runtime (e.g. the actual book ID, the customer's daily rental limit).

> **About the audio provider (Inaudio / Findaway):** Renting, adding to bookshelf, renewing, and returning all require us to talk to the audio provider. If the provider rejects our request for any reason, the customer sees one generic message — `We encountered a problem and are not able to complete that request at this time.` — and the real reason is recorded in our server logs for our team to investigate. This row is listed at the bottom of every section that calls the provider.

---

## Table of Contents

1. [Browsing audiobooks](#1-browsing-audiobooks)
2. [Queue (waiting list)](#2-queue-waiting-list)
3. [Renting an audiobook](#3-renting-an-audiobook)
4. [Adding to bookshelf (purchasing)](#4-adding-to-bookshelf-purchasing)
5. [Renewing a rental](#5-renewing-a-rental)
6. [Returning an audiobook](#6-returning-an-audiobook)
7. [Listening / Playback](#7-listening--playback)
8. [Reviews & ratings](#8-reviews--ratings)
9. [Contact Us](#9-contact-us)
10. [Account-wide messages](#10-account-wide-messages)
11. [App input validation](#11-app-input-validation)
12. [Audio-provider generic error (reference)](#12-audio-provider-generic-error-reference)

---

## 1. Browsing audiobooks

| When they see it | What they see |
|---|---|
| Opens an audiobook that doesn't exist, has been deactivated, or they aren't allowed to view | `Audio with ID ${id} not found` |
| Opens an audiobook that exists but isn't enabled for their company's plan (e.g. company is rental-only but the title is purchase-only) | `Audio with ID ${id} is not available for your company.` |
| Opens a category page that isn't enabled for their company | `Category with ID ${categoryId} not found for your company` |

### Informational text shown on every audiobook detail screen

A short line appears explaining what the customer can do with the title. The wording depends on what their company allows:

| When | What they see |
|---|---|
| Bookshelf-only title | `This book will be added to your bookshelf and does not need to be checked back in.` |
| Rental-only title | `This book will be available for two weeks.` |
| Title that can be either rented or bookshelved | `This book can be rented for two weeks or added to your bookshelf and not checked back in.` |

---

## 2. Queue (waiting list)

| When they see it | What they see |
|---|---|
| Successfully removes a book from their queue | `The audio book with ID ${audioId} has been removed from your queued list.` |
| Tries to queue an audiobook that doesn't exist or is inactive | `Audio with ID ${id} not found` |
| Tries to queue a book that is already in their list (already queued, rented, or bookshelved) | `The audio book with ID ${audioId} is not available for queue.` |
| Tries to remove a book from their queue that isn't actually queued | `The audio book with ID ${audioId} doesn't exist in your queued list.` |
| Their account or their company's account is inactive | `Your account is inactive. That option is not available.` |

---

## 3. Renting an audiobook

| When they see it | What they see |
|---|---|
| Their account or their company's account is inactive | `Your account is inactive. That option is not available.` |
| Tries to rent an audiobook that doesn't exist or is inactive | `Audio with ID ${id} not found` |
| Tries to rent when their company has disabled rentals | `Renting is not available for this audio due to company policy.` |
| Tries to rent a title that is only sold (not rented) | `This title is only available for purchase, not for rental.` |
| All copies are currently rented out (no licenses free) | `All current copies of this title are on loan. Please check back later.` |
| Has already hit their max simultaneous-rentals limit | `You already have rented ${maxRentalItemsOnHand} books, please return one book` |
| Has hit their per-day rental limit | `You can't rent more than ${maxRentalItemsPerDay} books per day.` |
| Tries to rent a book they already own (bookshelved) | `You have already purchased this title.` |
| Tries to rent a book they already have rented | `Status unchanged` |
| Backend tried to auto-purchase an additional copy on their behalf but it failed | `Unable to process rental at this time. Please try again.` |
| Audio provider reports no licenses configured at all for this title | `There is no available licenses. Please talk to admin.` |
| Audio provider returned no free license to check out | `There is no available license for checkout the audio book.` |
| Audio provider returned a license that doesn't match the one we requested | `Invalid license` |
| **Audio provider failed (any reason — network, timeout, provider-side error)** while looking up licenses or checking one out | `We encountered a problem and are not able to complete that request at this time.` |

---

## 4. Adding to bookshelf (purchasing)

| When they see it | What they see |
|---|---|
| Their account or their company's account is inactive | `Your account is inactive. That option is not available.` |
| Tries to bookshelf an audiobook that doesn't exist or is inactive | `Audio with ID ${id} not found` |
| Tries to add to bookshelf when their company has disabled this | `Adding to bookshelf is not available for this audio due to company policy.` |
| Has hit their daily purchase limit | `You already have purchased ${maxAudioPurchaseItemsOnHand} books. Please try purchasing tomorrow.` |
| Tries to bookshelf a book that's already on their bookshelf | `Status unchanged` |
| Audio provider responded oddly to the purchase request (returned the wrong number of licenses) | `There is an issue while purchasing retail license.` |
| **Audio provider failed (any reason — network, timeout, provider-side error)** while purchasing the license | `We encountered a problem and are not able to complete that request at this time.` |

---

## 5. Renewing a rental

Renew uses the same validation rules and wording as renting (Section 3), with one renew-only message for "you never rented this in the first place".

How renew handles the previous license at the audio provider:

- Before doing anything, we ask the audio provider whether the customer's existing license is still on loan.
- **Still on loan** — we check it in at the provider, then check out a new period. The new expiry is the previous expiry + the rental period (any unused time carries over).
- **Already returned by the provider** (loan period elapsed at the provider side without an explicit return on our side) — we **silently treat the renew as a fresh rental**: no customer-facing error, no check-in call, and the new expiry starts from "now". The state-drift is logged for operators.

| When they see it | What they see |
|---|---|
| Their account or their company's account is inactive | `Your account is inactive. That option is not available.` |
| Tries to renew an audiobook that doesn't exist or is inactive | `Audio with ID ${id} not found` |
| Tries to renew a book they never rented (renew-only) | `The audio book with ID ${audioId} doesn't exist in your rented list.` |
| Tries to renew when their company has disabled rentals/renewals | `Renewing is not available for this audio due to company policy.` |
| Tries to renew a title that is only sold (not rented) | `This title is only available for purchase, not for rental.` |
| All copies are currently rented out and the auto-purchase cap is reached | `All current copies of this title are on loan. Please check back later.` |
| Has other active rentals at the simultaneous-rentals limit (excluding the title being renewed) | `You already have rented ${maxRentalItemsOnHand} books, please return one book` |
| Has hit their per-day rental limit on other titles (excluding the title being renewed) | `You can't rent more than ${maxRentalItemsPerDay} books per day.` |
| Backend tried to auto-purchase an additional copy on their behalf but it failed | `Unable to process rental at this time. Please try again.` |
| Audio-metadata row for the title is missing (data-integrity issue) | `This title is temporarily unavailable. Please talk to admin.` |
| Audio provider reports no licenses configured at all for this title | `There is no available licenses. Please talk to admin.` |
| Audio provider returned no free license to check out (renewal requires re-checking-out) | `There is no available license for checkout the audio book.` |
| Audio provider returned a license that doesn't match the one we requested | `Invalid license` |
| **Audio provider failed (any reason — network, timeout, provider-side error)** while looking up the previous license's state, checking the old license back in, purchasing a new copy, looking up free licenses, or re-checking-out the license | `We encountered a problem and are not able to complete that request at this time.` |

> Note: renewing re-runs the same audio-provider calls as renting (plus a state-check of the previous license, and a checkin when that license is still on loan), so all of the provider-related messages from Section 3 can also appear here.

---

## 6. Returning an audiobook

| When they see it | What they see |
|---|---|
| Tries to return a book they don't have rented | `The audio book with ID ${audioId} doesn't exist in your rented list.` |
| Tries to return a book whose rental period has already expired (it was already returned automatically) | `The audio book with ID ${audioId} is already returned.` |
| **Audio provider failed (any reason — network, timeout, provider-side error)** while checking the license back in | `We encountered a problem and are not able to complete that request at this time.` |

> Note: if the audio provider fails on return, the rental is **not** cleared on our side — the customer sees the generic provider-error message above and can retry.

---

## 7. Listening / Playback

| When they see it | What they see |
|---|---|
| Opens the playlist for an audiobook that doesn't exist or they can't access | `Audio with ID ${audioId} not found` |
| Tries to play an audiobook they haven't rented or bookshelved | `Need to rent or bookself the audio for getting playlist.` |
| The app sends a play/pause event with an invalid chapter or a time position past the end of the chapter | `Invalid chapter or play position exceeds chapter duration` |

---

## 8. Reviews & ratings

| When they see it | What they see |
|---|---|
| Tries to submit a second review for an audiobook they've already reviewed | `You have already submitted a review for this audio.` |

---

## 9. Contact Us

| When they see it | What they see |
|---|---|
| Tries to send a Contact-Us message but the recipient email hasn't been configured on our side | `Contact us admin email is missing in config` |

> Note: this message exposes an internal-configuration problem and should probably be rewritten to something like "Sorry, we can't deliver your message right now. Please try again later." — flagged as a copy-improvement candidate.

---

## 10. Account-wide messages

| When they see it | What they see |
|---|---|
| Their account (or their company's account) has been deactivated, and they try to queue / rent / bookshelf / renew | `Your account is inactive. That option is not available.` |

(This is the same string listed under sections 2, 3, 4, and 5 — repeated here as a standalone reference.)

---

## 11. App input validation

These appear when the customer's app sends a value the backend rejects — usually only seen if someone uses a non-standard client or tampers with the request.

| When they see it | What they see |
|---|---|
| Sends a negative `part_number` to the play-tracking endpoint | `Part number is invalid` |
| Sends a negative `chapter_number` to the play-tracking endpoint | `Chapter number is invalid` |
| Sends a negative `play_position` to the play-tracking endpoint | `Play position must be greater than or equal to 0` |
| Calls a user-audio action endpoint with an action name that isn't allowed | `Invalid action. Allowed values are renew, return, dequeue.` |

---

## 12. Audio-provider generic error (reference)

A single message is shown whenever any call to the audio provider (Inaudio / Findaway) fails for any reason — HTTP error, timeout, network drop, or provider-side rejection (e.g. invalid SKU, account not authorised, license unavailable in an unexpected way, provider outage).

**Message:** `We encountered a problem and are not able to complete that request at this time.`

**Customer actions that can trigger it:**
- Renting (looking up licenses, checking out the license, auto-purchasing an extra copy)
- Adding to bookshelf (purchasing the retail license)
- Renewing (auto-purchasing, looking up licenses, re-checking-out)
- Returning (checking the license back in)

**Where the real reason goes:** the underlying provider response (status code, body, etc.) is written to our server logs. Search server logs for `Inaudio <METHOD> <url> failed` to find what actually went wrong.

### Customer-friendly messages whose root cause is the audio-provider's state

These are messages we generate ourselves *based on* what the audio provider told us — they read as normal customer copy rather than a passed-through technical error. Listed here for completeness so the team can see which user-visible strings depend on provider behaviour:

- `All current copies of this title are on loan. Please check back later.`
- `There is no available licenses. Please talk to admin.`
- `There is no available license for checkout the audio book.`
- `Invalid license`
- `There is an issue while purchasing retail license.`
- `Unable to process rental at this time. Please try again.`
- `This title is temporarily unavailable. Please talk to admin.`

---

## A note for the team

If you change any wording on this page, also update the parallel engineering reference at [AUDIO_USER_MESSAGES.md](AUDIO_USER_MESSAGES.md), which keeps a developer-oriented view (status codes, source file lines, exception classes, internal operator logs).
