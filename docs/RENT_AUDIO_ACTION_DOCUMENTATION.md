# Rent Audio Action - Validation Checks & Processing Steps

## Overview
The `rentAudio` method in `UserAudioService` orchestrates a comprehensive rental workflow for audiobooks, including multiple validation checks, smart license management, and activity logging.

---

## Pre-Validation & Data Retrieval

### 1. Company & User Account Status Validation
- **Step:** Retrieve user's company information from cache
- **Check:** Verify both `company.is_active` and `user.is_active` are `true`
- **Error Message:** `"Your account is inactive. That option is not available."`
- **Location:** [src/users/user-audio.service.ts:349-352](src/users/user-audio.service.ts#L349-L352)

### 2. Fetch Company Configuration
- **Action:** Retrieve company-specific app configurations from `company.app_configs`
- **Purpose:** Extract rental-related settings for subsequent validations
- **Contains:** Audio rental periods, rental limits, credit costs, and action permissions
- **Location:** [src/users/user-audio.service.ts:355-357](src/users/user-audio.service.ts#L355-L357)

### 3. Calculate Rental Period Parameters
- **Action:** Get `audio_rental_period_in_days` from app configuration (default: 24 hours if not set)
- **Calculation:** Calculate `intervalStartTime` by subtracting rental period from current time
- **Set:** `currentTime` as the current timestamp
- **Purpose:** Enables time-based rental period validation
- **Location:** [src/users/user-audio.service.ts:359-366](src/users/user-audio.service.ts#L359-L366)

### 4. Parallel Data Retrieval
Execute four queries in parallel for efficiency:
- Fetch audio record with metadata relationship
- Fetch existing user-audio status record (if any)
- Count user's currently active rented audiobooks (not expired)
- Count user's rentals within the configured rental period
- **Location:** [src/users/user-audio.service.ts:368-388](src/users/user-audio.service.ts#L368-L388)

---

## Business Rule Validations

### 5. Company Policy Validation
- **Step:** Verify rental action is permitted based on `available_audio_title_user_action` configuration
- **Method:** Uses `isActionAllowed()` to validate against audio metadata settings
- **Checks Against:**
  - Company-wide action permissions (`rent`, `bookshelf`, or `both`)
  - Individual audio title availability settings
- **Error Message:** `"Renting is not available for this audio due to company policy."`
- **Location:** [src/users/user-audio.service.ts:391-405](src/users/user-audio.service.ts#L391-L405)

### 6. Purchase-Only Title Check
- **Check:** Verify `audio.is_only_for_purchase` is `false`
- **Purpose:** Prevents rental of titles configured for purchase-only
- **Business Logic:** Some titles may be restricted to purchase/bookshelf actions only
- **Error Message:** `"This title is only available for purchase, not for rental."`
- **Location:** [src/users/user-audio.service.ts:407-411](src/users/user-audio.service.ts#L407-L411)

### 7. Rental Credit Cost Comparison
- **Check:** Compare `audio_rental_credit_cost` with `audio.bookshelf_credit_cost`
- **Logic:** If `audio_rental_credit_cost >= bookshelf_credit_cost`, reject rental
- **Purpose:** Prevents users from renting when purchasing is more economical
- **Error Message:** `"This title is available for purchase at a better value than rental. Please consider purchasing instead."`
- **Location:** [src/users/user-audio.service.ts:414-420](src/users/user-audio.service.ts#L414-L420)

### 8. Rental License Availability Check
- **Check:** Verify `audio.total_rented < maxPossibleRentals`
- **Dynamic Limit Calculation:**
  - Retrieve `purchased_rental_license_limit` (defaults to current `purchased_rental_licenses` if null)
  - **If `audio.metadata.is_for_sale = true`:**
    - Max possible rentals = `purchased_rental_license_limit`
    - Allows auto-purchasing of additional licenses up to this limit
  - **If `audio.metadata.is_for_sale = false`:**
    - Max possible rentals = current `purchased_rental_licenses` only
    - No expansion possible (vendor no longer sells the title)
- **Purpose:** Ensures total rentals don't exceed configured inventory limits
- **Error Message:** `"All current copies of this title are on loan. Please check back later."`
- **Location:** [src/users/user-audio.service.ts:423-432](src/users/user-audio.service.ts#L423-L432)

### 9. Maximum Rental Items On Hand Validation
- **Config Key:** `max_audio_rental_items_on_hand` (default: 1)
- **Check:** Verify user's current active rentals < maximum allowed on hand
- **Purpose:** Prevents users from hoarding rental copies
- **Error Message:** `"You already have rented {maxRentalItemsOnHand} books, please return one book"`
- **Location:** [src/users/user-audio.service.ts:434-439](src/users/user-audio.service.ts#L434-L439)

### 10. Maximum Rental Items Per Day Validation
- **Config Key:** `max_audio_rental_items_per_day` (default: 1)
- **Time Window:** Rolling 24-hour window from the current time
- **Check:** Verify user's rentals in the last 24 hours < maximum allowed per day
- **Purpose:** Rate-limits rental frequency to prevent abuse
- **Error Message:** `"You can't rent more than {maxRentalItemsPerDay} books per day."`
- **Location:** [src/users/user-audio.service.ts:467-473](src/users/user-audio.service.ts#L467-L473)

### 11. Duplicate Rental Prevention
- **Check:** Verify user doesn't already have an active rental for this specific audiobook
- **Validates:**
  - `userAudio.status !== 'rented'` OR
  - `rental_expire_at <= current date` (rental has expired)
- **Purpose:** Prevents accidental duplicate rentals of the same title
- **Error Message:** `"Status unchanged"`
- **Location:** [src/users/user-audio.service.ts:450-459](src/users/user-audio.service.ts#L450-L459)

---

## Rental Processing Actions

### 12. Auto-Purchase Additional License (Conditional)
- **Conditions:** Only executes when ALL three conditions are true:
  1. `audio.metadata.is_for_sale = true` (audiobook still available for purchase from vendor)
  2. `audio.total_rented >= audio.metadata.purchased_rental_licenses` (all currently owned licenses in use)
  3. `audio.metadata.purchased_rental_licenses < purchasedRentalLicenseLimit` (have room to buy more within limit)
- **Action:** Automatically purchase 1 additional license from audio engine
- **Parameters Used:**
  - Audio SKU, product ID, findaway price, and region ('US')
- **Post-Purchase Actions:**
  - Manually increment `audio.metadata.purchased_rental_licenses` in database
  - Update local object to reflect the change
- **Purpose:** Dynamically expands rental inventory when needed, respecting configured limits
- **Location:** [src/users/user-audio.service.ts:466-487](src/users/user-audio.service.ts#L466-L487)

### 13. Calculate Rental Expiration Date
- **Config Key:** `audio_rental_period_in_days` (default: 14 days)
- **Calculation:** Add rental period to current date
- **Stores In:** `rentalExpiresAt` variable
- **Purpose:** Determines when the rental automatically expires
- **Location:** [src/users/user-audio.service.ts:489-491](src/users/user-audio.service.ts#L489-L491)

### 14. Update or Create User Audio Status Record
- **If Existing Record Found:**
  - Update status to `'rented'`
  - Set `rental_expire_at` to calculated expiration date
  - Reset `license_id` to null (will be assigned after checkout)
  - Assign `list_order` if not already set
  - Update `updated_at` timestamp
- **If No Existing Record:**
  - Create new `UserAudioStatus` record with all rental details:
    - `audio_id`, `user_id`, `status: 'rented'`
    - `rental_expire_at`, `updated_at`
    - Assign next available `list_order` for rental status
- **Purpose:** Tracks rental state for each user-audio combination
- **Location:** [src/users/user-audio.service.ts:494-516](src/users/user-audio.service.ts#L494-L516)

### 15. License Checkout
- **Steps:**
  1. Retrieve available license for the audiobook SKU
  2. Checkout license from audio engine for `rentalPeriodInDays * 1440` minutes
  3. Assign `checkout.license_id` to the user audio status record
- **Purpose:** Activates the rental license in the audio engine system
- **Location:** [src/users/user-audio.service.ts:518-524](src/users/user-audio.service.ts#L518-L524)

### 16. Persist All Changes (Parallel Execution)
Execute three operations simultaneously for performance:

#### 16.1 Save User Audio Status
- Store/update user audio status record in database
- Includes all rental details and license assignment

#### 16.2 Increment Audio Total Rented Count
- Update `audio.total_rented` count by 1
- Reflects rental inventory consumption

#### 16.3 Store User Activity Log
- Activity Type: `RENT`
- Logged Details:
  - `credit_used`: from `audio_rental_credit_cost` config (default: 1)
  - `start_time`: rental initiated timestamp
  - `end_time`: rental expiration timestamp
- **Purpose:** Maintains audit trail and credit tracking

**Location:** [src/users/user-audio.service.ts:526-537](src/users/user-audio.service.ts#L526-L537)

### 17. Elasticsearch Synchronization
- **Action:** Sync updated audio record to Elasticsearch index
- **Purpose:** Ensures search results reflect latest rental status and availability
- **Location:** [src/users/user-audio.service.ts:539](src/users/user-audio.service.ts#L539)

### 18. Return Updated Status
- **Action:** Fetch and return the final user audio status record
- **Includes:** All updated fields and rental information
- **Purpose:** Provides confirmation and updated state to the client
- **Location:** [src/users/user-audio.service.ts:541-543](src/users/user-audio.service.ts#L541-L543)

---

## Configuration Dependencies

The rental action depends on the following app configuration settings:

| Configuration Key | Default Value | Purpose |
|---|---|---|
| `audio_rental_period_in_days` | 14 days | Defines rental duration in days |
| `max_audio_rental_items_on_hand` | 1 | Maximum concurrent rentals a user can have |
| `max_audio_rental_items_per_day` | 1 | Maximum rentals allowed within a rolling 24-hour window |
| `audio_rental_credit_cost` | 1 | Credit cost per rental action |
| `available_audio_title_user_action` | (varies) | Company policy for available actions: `'rent'`, `'bookshelf'`, or `'both'` |

---

## Audio Entity Fields

Key fields on the `Audio` entity used in rental decisions:

| Field | Type | Purpose |
|---|---|---|
| `purchased_rental_license_limit` | int | Maximum total library licenses to own for this title (defaults to current `purchased_rental_licenses` if null) |
| `is_only_for_purchase` | boolean | If true, rental action is disabled for this title |
| `bookshelf_credit_cost` | int | Credit cost to bookshelf/purchase the title |
| `total_rented` | int | Current count of active rentals |

Key fields on `AudioMetadata`:

| Field | Type | Purpose |
|---|---|---|
| `purchased_rental_licenses` | int | Current number of library licenses we own |
| `is_for_sale` | boolean | Whether the vendor still sells this title |

---

## Summary Statistics

| Metric | Count |
|---|---|
| **Total Validation Checks** | 7 business rule validations |
| **Total Processing Steps** | 7 processing actions |
| **Total Configuration Dependencies** | 5 app config settings |
| **Parallel Queries** | 4 data retrieval operations |
| **Parallel Saves** | 3 persistence operations |

---

## Business Logic Flow Diagram

```
START: rentAudio(audioId, user)
  ├─ [1] Validate: Company & User Active
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "Your account is inactive..."
  │
  ├─ [2] Fetch: Company Configuration
  │
  ├─ [3] Calculate: Rental Period Parameters
  │
  ├─ [4] Retrieve: Audio, UserAudio, Counts (Parallel)
  │
  ├─ [5] Validate: Company Policy
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "Renting is not available..."
  │
  ├─ [6] Validate: Purchase-Only Title
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "This title is only available for purchase..."
  │
  ├─ [7] Validate: Rental Credit Cost vs Bookshelf Cost
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "This title is available for purchase at a better value..."
  │
  ├─ [8] Validate: Rental License Available
  │   ├─ (Calculate: limit = purchased_rental_license_limit ?? purchased_rental_licenses)
  │   ├─ (Adjust: based on is_for_sale flag)
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "All current copies are on loan..."
  │
  ├─ [9] Validate: Max Items On Hand
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "You already have rented X books..."
  │
  ├─ [10] Validate: Max Items Per Period
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "You can't rent more than X books..."
  │
  ├─ [11] Validate: No Duplicate Active Rental
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "Status unchanged"
  │
  ├─ [12] Auto-Purchase License (If all 3 conditions met)
  │   ├─ is_for_sale = true
  │   ├─ total_rented >= purchased_rental_licenses
  │   ├─ purchased_rental_licenses < limit
  │   ├─ Purchase from INaudio
  │   └─ Manually increment purchased_rental_licenses
  │
  ├─ [13] Calculate: Rental Expiration Date
  │
  ├─ [14] Update/Create: User Audio Status
  │
  ├─ [15] Checkout: License from Audio Engine
  │
  ├─ [16] Persist: All Changes (Parallel)
  │   ├─ Save User Audio Status
  │   ├─ Increment Audio Total Rented
  │   └─ Store Activity Log
  │
  ├─ [17] Sync: Elasticsearch
  │
  └─ [18] Return: Updated User Audio Status
END
```

---

## Error Handling Summary

| Validation | Error Message | HTTP Status |
|---|---|---|
| Account Status | `"Your account is inactive. That option is not available."` | 400 Bad Request |
| Company Policy | `"Renting is not available for this audio due to company policy."` | 400 Bad Request |
| Purchase-Only Title | `"This title is only available for purchase, not for rental."` | 400 Bad Request |
| Credit Cost | `"This title is available for purchase at a better value than rental. Please consider purchasing instead."` | 400 Bad Request |
| License Available | `"All current copies of this title are on loan. Please check back later."` | 400 Bad Request |
| Items On Hand | `"You already have rented {X} books, please return one book"` | 400 Bad Request |
| Items Per Period | `"You can't rent more than {X} books within {Y} hours."` | 400 Bad Request |
| Duplicate Rental | `"Status unchanged"` | 400 Bad Request |

---

## Auto-Purchase Logic - Detailed Example

### Scenario: Book with Increasing Demand

**Initial Setup:**
- `purchased_rental_licenses` = 5 (base owned licenses)
- `purchased_rental_license_limit` = 7 (max we're willing to own)
- `is_for_sale` = true (vendor still sells it)

**Rental Progression:**

| Event | total_rented | owned licenses | Can rent? | Action |
|---|---|---|---|---|
| Initial state | 0 | 5 | ✓ Yes | Checkout one of 5 |
| User 1 rents | 1 | 5 | ✓ Yes | Checkout one of 5 |
| User 2 rents | 2 | 5 | ✓ Yes | Checkout one of 5 |
| User 3 rents | 3 | 5 | ✓ Yes | Checkout one of 5 |
| User 4 rents | 4 | 5 | ✓ Yes | Checkout one of 5 |
| User 5 rents | 5 | 5 | ✓ Yes (auto-buy) | Purchase #6, increment to 6, checkout |
| User 6 rents | 6 | 6 | ✓ Yes (auto-buy) | Purchase #7, increment to 7, checkout |
| User 7 tries | 7 | 7 | ✗ No | Reject - at limit |

---

## Last Updated
Generated with reference to [src/users/user-audio.service.ts](src/users/user-audio.service.ts#L344-L543)
