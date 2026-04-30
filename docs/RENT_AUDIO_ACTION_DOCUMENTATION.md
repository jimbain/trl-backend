# Rent Audio Action - Validation Checks & Processing Steps

## Overview
The `rentAudio` method in `UserAudioService` orchestrates a comprehensive rental workflow for audiobooks, including validation checks, license management, and activity logging.

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

### 6. Rental License Availability Check
- **Check:** Verify `audio.total_rented < rentalLimit`
- **Dynamic Limit Calculation:**
  - **If `audio.metadata.is_for_sale = true`:**
    - Limit = `purchased_rental_licenses + purchased_rental_license_limit`
    - Allows auto-purchasing of additional licenses
  - **If `audio.metadata.is_for_sale = false`:**
    - Limit = `purchased_rental_licenses` only
    - Only base inventory available (no expansion possible)
- **Purpose:** Ensures total rentals don't exceed available inventory
- **Error Message:** `"All current copies of this title are on loan. Please check back later."`
- **Location:** [src/users/user-audio.service.ts:407-416](src/users/user-audio.service.ts#L407-L416)

### 7. Maximum Rental Items On Hand Validation
- **Config Key:** `max_audio_rental_items_on_hand` (default: 1)
- **Check:** Verify user's current active rentals < maximum allowed on hand
- **Purpose:** Prevents users from hoarding rental copies
- **Error Message:** `"You already have rented {maxRentalItemsOnHand} books, please return one book"`
- **Location:** [src/users/user-audio.service.ts:418-424](src/users/user-audio.service.ts#L418-L424)

### 8. Maximum Rental Items Per Period Validation
- **Config Key:** `max_audio_rental_items_per_period` (default: 1)
- **Time Window:** Calculated using `audio_rental_period_in_days` from configuration
- **Check:** Verify user's rentals within the period < maximum allowed per period
- **Purpose:** Rate-limits rental frequency to prevent abuse
- **Error Message:** `"You can't rent more than {maxRentalItemsPerPeriodOnHand} books within {rentalPeriodInHours} hours."`
- **Location:** [src/users/user-audio.service.ts:418-433](src/users/user-audio.service.ts#L418-L433)

### 9. Duplicate Rental Prevention
- **Check:** Verify user doesn't already have an active rental for this specific audiobook
- **Validates:**
  - `userAudio.status !== 'rented'` OR
  - `rental_expire_at <= current date` (rental has expired)
- **Purpose:** Prevents accidental duplicate rentals of the same title
- **Error Message:** `"Status unchanged"`
- **Location:** [src/users/user-audio.service.ts:435-441](src/users/user-audio.service.ts#L435-L441)

---

## Rental Processing Actions

### 10. Auto-Purchase Additional License (Conditional)
- **Condition:** Only executes when BOTH conditions are true:
  - `audio.metadata.is_for_sale = true` (audiobook still available for purchase)
  - `audio.total_rented >= audio.metadata.purchased_rental_licenses` (all base licenses in use)
- **Action:** Automatically purchase 1 additional license from audio engine
- **Parameters Used:**
  - Audio SKU, product ID, findaway price, and region ('US')
- **Purpose:** Dynamically expands rental inventory when needed
- **Location:** [src/users/user-audio.service.ts:443-454](src/users/user-audio.service.ts#L443-L454)

### 11. Calculate Rental Expiration Date
- **Config Key:** `audio_rental_period_in_days` (default: 14 days)
- **Calculation:** Add rental period to current date
- **Stores In:** `rentalExpiresAt` variable
- **Purpose:** Determines when the rental automatically expires
- **Location:** [src/users/user-audio.service.ts:456-458](src/users/user-audio.service.ts#L456-L458)

### 12. Update or Create User Audio Status Record
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
- **Location:** [src/users/user-audio.service.ts:461-483](src/users/user-audio.service.ts#L461-L483)

### 13. License Checkout
- **Steps:**
  1. Retrieve available license for the audiobook SKU
  2. Checkout license from audio engine for `rentalPeriodInDays * 1440` minutes
  3. Assign `checkout.license_id` to the user audio status record
- **Purpose:** Activates the rental license in the audio engine system
- **Location:** [src/users/user-audio.service.ts:485-491](src/users/user-audio.service.ts#L485-L491)

### 14. Persist All Changes (Parallel Execution)
Execute three operations simultaneously for performance:

#### 14.1 Save User Audio Status
- Store/update user audio status record in database
- Includes all rental details and license assignment

#### 14.2 Increment Audio Total Rented Count
- Update `audio.total_rented` count by 1
- Reflects rental inventory consumption

#### 14.3 Store User Activity Log
- Activity Type: `RENT`
- Logged Details:
  - `credit_used`: from `audio_rental_credit_cost` config (default: 1)
  - `start_time`: rental initiated timestamp
  - `end_time`: rental expiration timestamp
- **Purpose:** Maintains audit trail and credit tracking

**Location:** [src/users/user-audio.service.ts:493-504](src/users/user-audio.service.ts#L493-L504)

### 15. Elasticsearch Synchronization
- **Action:** Sync updated audio record to Elasticsearch index
- **Purpose:** Ensures search results reflect latest rental status and availability
- **Location:** [src/users/user-audio.service.ts:506](src/users/user-audio.service.ts#L506)

### 16. Return Updated Status
- **Action:** Fetch and return the final user audio status record
- **Includes:** All updated fields and rental information
- **Purpose:** Provides confirmation and updated state to the client
- **Location:** [src/users/user-audio.service.ts:508-510](src/users/user-audio.service.ts#L508-L510)

---

## Configuration Dependencies

The rental action depends on the following app configuration settings:

| Configuration Key | Default Value | Purpose |
|---|---|---|
| `audio_rental_period_in_days` | 14 days | Defines rental duration and period window for rate limiting |
| `max_audio_rental_items_on_hand` | 1 | Maximum concurrent rentals a user can have |
| `max_audio_rental_items_per_period` | 1 | Maximum rentals allowed within the rental period |
| `audio_rental_credit_cost` | 1 | Credit cost per rental action |
| `available_audio_title_user_action` | (varies) | Company policy for available actions: `'rent'`, `'bookshelf'`, or `'both'` |

---

## Summary Statistics

| Metric | Count |
|---|---|
| **Total Validation Checks** | 6 business rule validations |
| **Total Processing Steps** | 6 processing actions |
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
  ├─ [6] Validate: Rental License Available
  │   ├─ (Calculate: rentalLimit based on is_for_sale)
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "All current copies are on loan..."
  │
  ├─ [7] Validate: Max Items On Hand
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "You already have rented X books..."
  │
  ├─ [8] Validate: Max Items Per Period
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "You can't rent more than X books..."
  │
  ├─ [9] Validate: No Duplicate Active Rental
  │   ├─ ✓ Continue
  │   └─ ✗ Error: "Status unchanged"
  │
  ├─ [10] Auto-Purchase License (If is_for_sale && limit reached)
  │
  ├─ [11] Calculate: Rental Expiration Date
  │
  ├─ [12] Update/Create: User Audio Status
  │
  ├─ [13] Checkout: License from Audio Engine
  │
  ├─ [14] Persist: All Changes (Parallel)
  │   ├─ Save User Audio Status
  │   ├─ Increment Audio Total Rented
  │   └─ Store Activity Log
  │
  ├─ [15] Sync: Elasticsearch
  │
  └─ [16] Return: Updated User Audio Status
END
```

---

## Error Handling Summary

| Validation | Error Message | HTTP Status |
|---|---|---|
| Account Status | `"Your account is inactive. That option is not available."` | 400 Bad Request |
| Company Policy | `"Renting is not available for this audio due to company policy."` | 400 Bad Request |
| License Available | `"All current copies of this title are on loan. Please check back later."` | 400 Bad Request |
| Items On Hand | `"You already have rented {X} books, please return one book"` | 400 Bad Request |
| Items Per Period | `"You can't rent more than {X} books within {Y} hours."` | 400 Bad Request |
| Duplicate Rental | `"Status unchanged"` | 400 Bad Request |

---

## Last Updated
Generated with reference to [src/users/user-audio.service.ts](src/users/user-audio.service.ts#L344-L510)