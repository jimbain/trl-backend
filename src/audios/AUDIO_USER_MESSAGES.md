# Audio & User Messages Reference

Single source of truth for every user-facing string emitted by `src/audios` and `src/users` — success confirmations, exceptions, DTO validation, and the Inaudio / Elasticsearch operator log messages. Each entry preserves the message verbatim (including `${variable}` placeholders) and links back to the source line so copy edits go through the code.

## Table of Contents
1. [Audio Catalog](#1-audio-catalog)
2. [Rental, Bookshelf, Queue & Renew](#2-rental-bookshelf-queue--renew)
3. [Audio Reviews](#3-audio-reviews)
4. [Audio Player / Playlist](#4-audio-player--playlist)
5. [User Management](#5-user-management)
6. [Contact-Us](#6-contact-us)
7. [DTO Validation](#7-dto-validation)
8. [Inaudio HTTP Bridge Errors](#8-inaudio-http-bridge-errors)
9. [Inaudio Integration (operator logs)](#9-inaudio-integration-operator-logs)
10. [Elasticsearch Sync & Scripts (operator logs)](#10-elasticsearch-sync--scripts-operator-logs)

Notation:
- **Scenario** — what the user did to trigger this message
- **Status** — HTTP status & NestJS exception class (omitted for success / log entries)
- **Message** — exact string returned to the client (or logged)
- **Source** — file:line link

---

## 1. Audio Catalog

### Audio not found
- **Scenario:** `GET /audios/:id` when the audio doesn't exist, is inactive, or the requesting user lacks access
- **Status:** 404 `NotFoundException`
- **Message:** `Audio with ID ${id} not found`
- **Source:** [audio.service.ts:314](audio.service.ts#L314)

### Audio not available for company
- **Scenario:** `GET /audios/:id` when the audio fails the company's `available_audio_title_user_action` config (e.g. company is rent-only but title is purchase-only)
- **Status:** 404 `NotFoundException`
- **Message:** `Audio with ID ${id} is not available for your company.`
- **Source:** [audio.service.ts:1011](audio.service.ts#L1011)

### Category not configured for company
- **Scenario:** `GET /audio-categories/:id/audios` when the category isn't whitelisted for the user's company
- **Status:** 404 `NotFoundException`
- **Message:** `Category with ID ${categoryId} not found for your company`
- **Source:** [audio.service.ts:815](audio.service.ts#L815)

### `available_for_message` (informational payload in `AudioDto`)
Returned as a field on every audio detail response; the value depends on `available_for`:

| `available_for` | Message |
|---|---|
| `bookshelf` | `This book will be added to your bookshelf and does not need to be checked back in.` |
| `rent` | `This book will be available for two weeks.` |
| `both` | `This book can be rented for two weeks or added to your bookshelf and not checked back in.` |

**Source:** [dto/audio.dto.ts:103-107](dto/audio.dto.ts#L103-L107)

---

## 2. Rental, Bookshelf, Queue & Renew

All messages below originate in [`../users/user-audio.service.ts`](../users/user-audio.service.ts).

### Account inactive (shared guard)
- **Scenario:** Any action (`queue`, `rent`, `bookshelf`, `renew`) when the company OR the user is inactive
- **Status:** 400 `BadRequestException`
- **Message:** `Your account is inactive. That option is not available.`
- **Source:** [../users/user-audio.service.ts:299](../users/user-audio.service.ts#L299), [:369](../users/user-audio.service.ts#L369), [:637](../users/user-audio.service.ts#L637), [:761](../users/user-audio.service.ts#L761)

### Queue

#### Audio cannot be queued (already in user's list)
- **Scenario:** `POST /user-audios/:audioId/actions/queue` when the audio is already queued / rented / bookshelved for the user
- **Status:** 400 `BadRequestException`
- **Message:** `The audio book with ID ${audioId} is not available for queue.`
- **Source:** [../users/user-audio.service.ts:316](../users/user-audio.service.ts#L316)

### Dequeue

#### Successful dequeue (success payload)
- **Scenario:** `POST /user-audios/:audioId/actions/dequeue` when removal succeeds
- **Status:** 200 — returned in response body
- **Message:** `The audio book with ID ${audioId} has been removed from your queued list.`
- **Source:** [../users/user-audio.service.ts:358](../users/user-audio.service.ts#L358)

### Rent

#### Audio not found
- **Scenario:** `POST /user-audios/:audioId/actions/rent` with an unknown `audioId`
- **Status:** 404 `NotFoundException`
- **Message:** `Audio with ID ${audioId} not found.`
- **Source:** [../users/user-audio.service.ts:407](../users/user-audio.service.ts#L407)

#### Renting disallowed by company policy
- **Scenario:** Company's `available_audio_title_user_action` config does not include `rent`
- **Status:** 400 `BadRequestException`
- **Message:** `Renting is not available for this audio due to company policy.`
- **Source:** [../users/user-audio.service.ts:423](../users/user-audio.service.ts#L423)

#### Title is purchase-only
- **Scenario:** Audio's `availability` is `purchasable` but user attempted to rent
- **Status:** 400 `BadRequestException`
- **Message:** `This title is only available for purchase, not for rental.`
- **Source:** [../users/user-audio.service.ts:430](../users/user-audio.service.ts#L430)

#### No copies available
- **Scenario:** All Inaudio licenses are currently rented (checked both before and after the auto-purchase fallback)
- **Status:** 400 `BadRequestException`
- **Message:** `All current copies of this title are on loan. Please check back later.`
- **Source:** [../users/user-audio.service.ts:447](../users/user-audio.service.ts#L447), [:510](../users/user-audio.service.ts#L510)

#### Max concurrent rentals reached
- **Scenario:** User already has `maxRentalItemsOnHand` active rentals
- **Status:** 400 `BadRequestException`
- **Message:** `You already have rented ${maxRentalItemsOnHand} books, please return one book`
- **Source:** [../users/user-audio.service.ts:456](../users/user-audio.service.ts#L456)

#### Daily rental cap reached
- **Scenario:** User has rented `maxRentalItemsPerDay` books today
- **Status:** 400 `BadRequestException`
- **Message:** `You can't rent more than ${maxRentalItemsPerDay} books per day.`
- **Source:** [../users/user-audio.service.ts:465](../users/user-audio.service.ts#L465)

#### Already on bookshelf
- **Scenario:** User attempts to rent a title they already own (bookshelved)
- **Status:** 400 `BadRequestException`
- **Message:** `You have already purchased this title.`
- **Source:** [../users/user-audio.service.ts:470](../users/user-audio.service.ts#L470)

#### No-op rent (already rented)
- **Scenario:** Rent / bookshelf called on an audio that is already in that exact status
- **Status:** 400 `BadRequestException`
- **Message:** `Status unchanged`
- **Source:** [../users/user-audio.service.ts:478](../users/user-audio.service.ts#L478), [:680](../users/user-audio.service.ts#L680)

#### Auto-purchase transaction failed
- **Scenario:** No license available → backend tries to auto-purchase another → transaction fails
- **Status:** 400 `BadRequestException`
- **Message:** `Unable to process rental at this time. Please try again.`
- **Source:** [../users/user-audio.service.ts:551](../users/user-audio.service.ts#L551)

### Bookshelf

#### Bookshelf disallowed by company policy
- **Scenario:** Company's `available_audio_title_user_action` config does not include `bookshelf`
- **Status:** 400 `BadRequestException`
- **Message:** `Adding to bookshelf is not available for this audio due to company policy.`
- **Source:** [../users/user-audio.service.ts:675](../users/user-audio.service.ts#L675)

#### Daily purchase cap reached
- **Scenario:** User has bookshelved `maxAudioPurchaseItemsOnHand` books today
- **Status:** 400 `BadRequestException`
- **Message:** `You already have purchased ${maxAudioPurchaseItemsOnHand} books. Please try purchasing tomorrow.`
- **Source:** [../users/user-audio.service.ts:688](../users/user-audio.service.ts#L688)

#### Retail license purchase glitch
- **Scenario:** Inaudio retail license purchase returns ≠ 1 license
- **Status:** 400 `BadRequestException`
- **Message:** `There is an issue while purchasing retail license.`
- **Source:** [../users/user-audio.service.ts:702](../users/user-audio.service.ts#L702)

### Renew

#### Renewing disallowed by company policy
- **Scenario:** Company config disallows renewals
- **Status:** 400 `BadRequestException`
- **Message:** `Renewing is not available due to company policy.`
- **Source:** [../users/user-audio.service.ts:791](../users/user-audio.service.ts#L791)

#### Audio not in user's rented list (renew)
- **Scenario:** Renew called for an audio the user never rented (also reused by Return)
- **Status:** 400 `BadRequestException`
- **Message:** `The audio book with ID ${audioId} doesn't exist in your rented list.`
- **Source:** [../users/user-audio.service.ts:797](../users/user-audio.service.ts#L797), [:880](../users/user-audio.service.ts#L880)

#### Cannot renew — at license cap
- **Scenario:** Total active rentals already meet or exceed the license limit, so renewal would over-commit
- **Status:** 400 `BadRequestException`
- **Message:** `You can't renew the book. Please talk to admin.`
- **Source:** [../users/user-audio.service.ts:803](../users/user-audio.service.ts#L803)

### Return

#### Already returned / rental expired
- **Scenario:** Return called after `rental_expire_at` has elapsed
- **Status:** 400 `BadRequestException`
- **Message:** `The audio book with ID ${audioId} is already returned.`
- **Source:** [../users/user-audio.service.ts:889](../users/user-audio.service.ts#L889)

### License checkout (rent flow)

#### No licenses configured
- **Scenario:** Audio metadata reports zero rental licenses available
- **Status:** 400 `BadRequestException`
- **Message:** `There is no available licenses. Please talk to admin.`
- **Source:** [../users/user-audio.service.ts:178](../users/user-audio.service.ts#L178)

#### Inaudio checkout returned no license
- **Scenario:** Inaudio `getAvailableLicense` returned no candidate to check out
- **Status:** 400 `BadRequestException`
- **Message:** `There is no available license for checkout the audio book.`
- **Source:** [../users/user-audio.service.ts:187](../users/user-audio.service.ts#L187)

#### License ID mismatch
- **Scenario:** Inaudio checkout response's `license_id` does not match the one requested
- **Status:** 400 `BadRequestException`
- **Message:** `Invalid license`
- **Source:** [../users/user-audio.service.ts:213](../users/user-audio.service.ts#L213)

---

## 3. Audio Reviews

### Duplicate review
- **Scenario:** `POST /audios/:id/reviews` when the user already reviewed this audio
- **Status:** 409 `ConflictException`
- **Message:** `You have already submitted a review for this audio.`
- **Source:** [audio_review.service.ts:71](audio_review.service.ts#L71)

---

## 4. Audio Player / Playlist

### Playlist — audio not found
- **Scenario:** `GET /audios/:id/playlist` for an unknown / inaccessible audio
- **Status:** 404 `NotFoundException`
- **Message:** `Audio with ID ${audioId} not found`
- **Source:** [audio.service.ts:1059](audio.service.ts#L1059)

### Playlist — must rent or bookshelf first
- **Scenario:** `GET /audios/:id/playlist` when the user neither rented nor bookshelved the audio
- **Status:** 400 `BadRequestException`
- **Message:** `Need to rent or bookself the audio for getting playlist.`
- **Source:** [audio.service.ts:1071](audio.service.ts#L1071)

### Player event — invalid chapter / position
- **Scenario:** `POST /audios/:id/trigger-event` with a `chapter_number` outside the audio's chapter list or a `play_position` beyond that chapter's duration
- **Status:** 400 `BadRequestException`
- **Message:** `Invalid chapter or play position exceeds chapter duration`
- **Source:** [audio.service.ts:1121](audio.service.ts#L1121)

---

## 5. User Management

All messages below originate in [`../users/user.service.ts`](../users/user.service.ts).

### Password missing on create
- **Scenario:** `POST /users` with no `password` and no company-level `default_password`
- **Status:** 400 `BadRequestException`
- **Message:** `Password is required. Either provide a password or configure a default password for the company.`
- **Source:** [../users/user.service.ts:217](../users/user.service.ts#L217)

### Email already used (update)
- **Scenario:** `PATCH /users/:id` with an email belonging to a different user
- **Status:** 422 `HttpException` (nested `errors.email` array)
- **Message:** `The email has already taken`
- **Source:** [../users/user.service.ts:256](../users/user.service.ts#L256)

### User not found (update / delete)
- **Scenario:** `PATCH /users/:id` or `DELETE /users/:id` for a user outside the caller's company
- **Status:** 404 `NotFoundException`
- **Message:** `User with ID ${id} not found for the company.`
- **Source:** [../users/user.service.ts:272](../users/user.service.ts#L272), [:298](../users/user.service.ts#L298)

### CSV import — wrong file type
- **Scenario:** Import upload that isn't a `.csv`
- **Status:** 400 `BadRequestException`
- **Message:** `Invalid file format. Only CSV file is allowed.`
- **Source:** [../users/user.service.ts:364](../users/user.service.ts#L364)

### CSV import — empty / missing columns
- **Scenario:** CSV has no rows or is missing `first_name` / `last_name` / `email`
- **Status:** 400 `BadRequestException`
- **Message:** `CSV file is empty or has invalid data. Ensure it has required columns: first_name, last_name, email`
- **Source:** [../users/user.service.ts:385](../users/user.service.ts#L385)

### CSV import — duplicate emails inside file
- **Scenario:** The uploaded CSV repeats the same email on multiple rows
- **Status:** 400 `BadRequestException`
- **Message:** `${csvDuplicates.length} email(s) appear multiple times in your CSV file. Duplicates: ${duplicatesList}. Please remove duplicates and try again.`
- **Source:** [../users/user.service.ts:410](../users/user.service.ts#L410)

### CSV import — emails owned by another company
- **Scenario:** Some emails in the CSV already exist under a different company
- **Status:** 400 `BadRequestException`
- **Message:** `${duplicateEmails.length} email address(es) already exist in another company: ${emailsList}. Please use different email addresses or contact support.`
- **Source:** [../users/user.service.ts:533](../users/user.service.ts#L533)

### CSV import — new users missing passwords
- **Scenario:** New rows in the CSV have no password and the company has no default password
- **Status:** 400 `BadRequestException`
- **Message:** `${usersWithoutPasswords.length} new user(s) are missing passwords. New users must have a password in CSV or a default password configured for the company. Users without passwords: ${missingPasswordEmails}${additionalCount}`
- **Source:** [../users/user.service.ts:555](../users/user.service.ts#L555)

### CSV export — no users matched
- **Scenario:** `GET /users/export` with filters that match zero users
- **Status:** 404 `NotFoundException`
- **Message:** `No users found for this company matching the specified filters.`
- **Source:** [../users/user.service.ts:650](../users/user.service.ts#L650)

---

## 6. Contact-Us

### Admin email not configured
- **Scenario:** `POST /contact-us` when the company / app config has no `contact_us_admin_email`
- **Status:** 404 `NotFoundException`
- **Message:** `Contact us admin email is missing in config`
- **Source:** [../users/contact-us.controller.ts:64](../users/contact-us.controller.ts#L64)

---

## 7. DTO Validation

Surface 400 Bad Request with the message embedded in the `class-validator` payload.

### Player event DTO ([`dto/trigger_audio_player_event.dto.ts`](dto/trigger_audio_player_event.dto.ts))

| Field | Message | Line |
|---|---|---|
| `part_number` (`@Min(0)`) | `Part number is invalid` | [6](dto/trigger_audio_player_event.dto.ts#L6) |
| `chapter_number` (`@Min(0)`) | `Chapter number is invalid` | [11](dto/trigger_audio_player_event.dto.ts#L11) |
| `play_position` (`@Min(0)`) | `Play position must be greater than or equal to 0` | [16](dto/trigger_audio_player_event.dto.ts#L16) |

### User-audio action param ([`../users/dto/user-audio-action-params.dto.ts`](../users/dto/user-audio-action-params.dto.ts))
- **Field:** `action`
- **Message:** `Invalid action. Allowed values are renew, return, dequeue.`
- **Source:** [../users/dto/user-audio-action-params.dto.ts:5](../users/dto/user-audio-action-params.dto.ts#L5)

> Note: the underlying decorator currently accepts more values than the message lists. Update either the enum or the message when this is reconciled.

### User list / export sort column
- **Message:** `sort_column must be one of: ${ALLOWED_SORT_COLUMNS.join(', ')}` (resolves to `id, name, is_active, created_at`)
- **Source:** [../users/dto/query-user.dto.ts:80](../users/dto/query-user.dto.ts#L80), [../users/dto/export-user.dto.ts:47](../users/dto/export-user.dto.ts#L47)

---

## 8. Inaudio HTTP Bridge Errors

Catch-all exception raised by [`../common/services/audio_engine.service.ts`](../common/services/audio_engine.service.ts) — the HTTP wrapper used for *every* outbound call to Inaudio (license lookup, checkout, checkin, retail purchase, session key, etc).

Whenever an Inaudio GET / POST / PUT / DELETE fails for any reason (HTTP error, timeout, network drop), the wrapper logs the full upstream error for ops and surfaces a single friendly message to the client. This can fire from **rent**, **bookshelf**, **renew**, **return**, and any other Inaudio-backed flow.

### Inaudio call failed (generic)
- **Scenario:** Any Inaudio HTTP call rejects. Common triggers: `purchaseRetailLicenses` (bookshelf), `checkoutLicenseOfAudio` (rent), `getSessionKey` (any first request), checkin (return).
- **Status:** 400 `BadRequestException`
- **Message:** `We encountered a problem and are not able to complete that request at this time.`
- **Source:** Constant `INAUDIO_USER_FACING_ERROR` — [../common/services/audio_engine.service.ts:5](../common/services/audio_engine.service.ts#L5); thrown in `get`/`post`/`put`/`delete` at lines [57](../common/services/audio_engine.service.ts#L57) / [79](../common/services/audio_engine.service.ts#L79) / [96](../common/services/audio_engine.service.ts#L96) / [112](../common/services/audio_engine.service.ts#L112)
- **Operator visibility:** Full axios error (stack or JSON dump) logged via `logger.error` — see `logInaudioFailure` at [../common/services/audio_engine.service.ts:32](../common/services/audio_engine.service.ts#L32). Search logs for `Inaudio <METHOD> <url> failed` to find the matching request.

---

## 9. Inaudio Integration (operator logs)

Not returned to API clients — emitted via NestJS `Logger` for ops/support visibility into the Inaudio (Findaway) flow. Listed here because they describe Inaudio-side scenarios.

### Checkout succeeded, local persistence failed
- **Scenario:** Inaudio `checkout` succeeded but the subsequent local DB save (user_audio_status + audio counter + activity log) threw — license is now leased at Inaudio without a local row
- **Level:** `error`
- **Message:** `Inaudio checkout succeeded but local persistence failed. sku=${audio.sku} license_id=${checkout.license_id} user_id=${user.id}: ${error?.message}`
- **Source:** [../users/user-audio.service.ts:617](../users/user-audio.service.ts#L617)

### Checkin failed
- **Scenario:** Return action — Inaudio `checkin` call failed; local return still proceeds
- **Level:** `error`
- **Message:** `Inaudio checkin failed for checkout_id=${checkoutId} user_id=${user.id}: ${error?.message}`
- **Source:** [../users/user-audio.service.ts:902](../users/user-audio.service.ts#L902)

### Returning legacy rental without Inaudio checkout_id
- **Scenario:** Return action on a rental that predates Inaudio checkout tracking — only local state is cleared
- **Level:** `warn`
- **Message:** `Returning audio_id=${audioId} for user_id=${user.id} without a stored Inaudio checkout_id; local state only.`
- **Source:** [../users/user-audio.service.ts:910](../users/user-audio.service.ts#L910)

### Auto-purchased a rental license
- **Scenario:** Rent action — Inaudio reported no free license, backend auto-purchased one
- **Level:** `log` / info
- **Message:** `Auto-purchased license for audio ${audio.sku}, new count: ${audio.metadata.purchased_rental_licenses}`
- **Source:** [../users/user-audio.service.ts:541](../users/user-audio.service.ts#L541)

### Auto-purchase failed
- **Scenario:** Auto-purchase fallback raised
- **Level:** `error`
- **Message:** `Auto-purchase failed for audio ${audio.sku}: ${error.message}`
- **Source:** [../users/user-audio.service.ts:547](../users/user-audio.service.ts#L547)

---

## 10. Elasticsearch Sync & Scripts (operator logs)

### Failed to sync after review save
- **Scenario:** `audio_review.service.ts` updates avg rating, then async ES sync fails
- **Level:** `error`
- **Message:** `Failed to sync audio ${audio.id} after rating update`
- **Source:** [audio_review.service.ts:112](audio_review.service.ts#L112)

### Elasticsearch unreachable
- **Scenario:** Health check fails during a sync run; then throws `Unable to connect to Elasticsearch`
- **Level:** `error`
- **Message:** `Elasticsearch connection failed!`
- **Source:** [audio-elasticsearch-sync.service.ts:616](audio-elasticsearch-sync.service.ts#L616)

### Database connection slots exhausted (per-attempt)
- **Level:** `warn`
- **Message:** `Database connection slots exhausted on attempt ${attempts}. Waiting 60 seconds before retry...`
- **Source:** [audio-elasticsearch-sync.service.ts:644](audio-elasticsearch-sync.service.ts#L644)

### Database hiccup on batch
- **Level:** `warn`
- **Message:** `Database issue on batch ${page + 1} (${error.message}), retry ${retryCount}/${maxRetries}`
- **Source:** [audio-elasticsearch-sync.service.ts:975](audio-elasticsearch-sync.service.ts#L975)

### Index lifecycle
| Event | Message | Line |
|---|---|---|
| Index created | `` Index '${this.index}' created `` | [573](audio-elasticsearch-sync.service.ts#L573) |
| Mapping updated | `` Index '${this.index}' mapping updated with new fields: ${fieldNames} `` | [589](audio-elasticsearch-sync.service.ts#L589) |
| Mapping already up-to-date | `` Index '${this.index}' already exists with up-to-date mapping `` | [593](audio-elasticsearch-sync.service.ts#L593) |

### Sync progress
| Event | Message | Line |
|---|---|---|
| Batch synced | `✅ Successfully synced batch ${page + 1}/${totalPages} (${transformed.length} documents)` | [744](audio-elasticsearch-sync.service.ts#L744) |
| Full sync complete | `✅ Completed syncing all audios to Elasticsearch` | [771](audio-elasticsearch-sync.service.ts#L771) |
| Single-audio sync | `Synced audio ID ${id} to Elasticsearch` | [811](audio-elasticsearch-sync.service.ts#L811) |
| Category sync complete | `✅ Completed syncing ${total} audios for category ${categoryId} to Elasticsearch` | [1063](audio-elasticsearch-sync.service.ts#L1063) |

### Scripts (CLI)

#### `sync-audios-by-category.ts` — missing argument
- **Message:** `Usage: npm run elastic:sync-by-category <category-id>`
- **Source:** [scripts/sync-audios-by-category.ts:9](scripts/sync-audios-by-category.ts#L9)

#### `generate-deep-links.ts` — per-audio failure
- **Message:** `  ✗ Failed to process audio ${currentAudioId}: ${error.message}`
- **Source:** [scripts/generate-deep-links.ts:201](scripts/generate-deep-links.ts#L201)

---

## Maintenance

When you add or change a user-facing string in `src/audios` or `src/users`, update the corresponding entry here in the same commit. To find new strings that may be missing from this doc, run:

```bash
grep -rn "throw new \(BadRequest\|NotFound\|Forbidden\|Unauthorized\|Conflict\|Http\)Exception\|message:" src/audios src/users
```
