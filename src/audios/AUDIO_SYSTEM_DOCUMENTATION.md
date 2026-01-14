# Audio System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [User Actions](#user-actions)
3. [Playback Tracking](#playback-tracking)
4. [Database Schema](#database-schema)
5. [Data Flow by Action](#data-flow-by-action)
6. [Entity Relationships](#entity-relationships)
7. [Configuration & Credits](#configuration--credits)
8. [API Endpoints](#api-endpoints)
9. [External Integrations](#external-integrations)

---

## System Overview

The TRL Audio System allows users to interact with audiobooks through eight primary actions:
- **Queue**: Add audio to a waiting list (no cost)
- **Dequeue**: Remove audio from the waiting list
- **Rent**: Temporarily access audio for a configurable period (typically 14 days)
- **Renew**: Extend the rental period for already-rented audio
- **Return**: Return rented audio before expiration
- **Bookshelf/Keep**: Permanently purchase audio for unlimited access
- **Play**: Track when user starts or resumes playback (analytics & daily counter)
- **Pause**: Save current playback position for resume functionality

### Core Components
- **Audio Entity**: Represents the audiobook catalog
- **Audio Metadata**: Detailed information about each audiobook (chapters, duration, narrators, etc.)
- **User Audio Status**: Tracks the relationship between users and audios (queued/rented/bookshelved)
- **User Activity Log**: Records all user actions with metadata (including play/pause events)
- **User Audioplayer Position**: Tracks exact playback position for resume functionality
- **Audio Reviews**: User ratings and reviews

---

## User Actions

### 1. QUEUE Action

**Purpose**: Add an audio to the user's waiting list for future access.

**API Endpoint**: `POST /user-audios/:audioId/actions/queue`

**Service Method**: `UserAudioService.queueAudio(audioId, user)`

**Credit Cost**: 0 (Free action)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | INSERT | `id`, `user_id`, `audio_id`, `status`, `updated_at` | ULID, user.id, audioId, 'queued', NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, audioId, 'audio', 'queue', `{credit_used: 0}`, NOW() |

**Validation Rules**:
- Audio must exist and be active
- User cannot already have this audio in any status (queued/rented/bookshelved)

**Response**: Returns the created `UserAudioStatus` record

**Example Flow**:
```
User clicks "Add to Queue" → API call → Check if audio exists →
Check if user already has this audio → Create user_audio_statuses record →
Log activity → Return success
```

---

### 2. DEQUEUE Action

**Purpose**: Remove an audio from the user's waiting list.

**API Endpoint**: `POST /user-audios/:audioId/actions/dequeue`

**Service Method**: `UserAudioService.dequeueAudio(audioId, user)`

**Credit Cost**: 0

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | DELETE | WHERE `user_id` = user.id AND `audio_id` = audioId AND `status` = 'queued' | - |

**Validation Rules**:
- Audio must exist in the user's queue (status = 'queued')
- Must belong to the requesting user

**Response**: Returns success message

**Example Flow**:
```
User clicks "Remove from Queue" → API call → Find queued audio →
Delete user_audio_statuses record → Return success
```

---

### 3. RENT Action

**Purpose**: Rent an audio for a limited time period (typically 14 days).

**API Endpoint**: `POST /user-audios/:audioId/actions/rent`

**Service Method**: `UserAudioService.rentAudio(audioId, user)`

**Credit Cost**: Configurable (default: 1 credit from `audio_rental_credit_cost` config)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | INSERT or UPDATE | `id`, `user_id`, `audio_id`, `status`, `license_id`, `rental_expire_at`, `updated_at` | ULID, user.id, audioId, 'rented', licenseId, NOW() + rental_period, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, audioId, 'audio', 'rent', `{credit_used, start_time, end_time}`, NOW() |
| `audios2` | UPDATE | `total_rented` | INCREMENT by 1 |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Validation Rules**:
- Audio must be available for rental (`is_only_for_purchase` = false)
- User's active rental count must be below `max_audio_rental_items_on_hand`
- User's rentals in period must be below `max_audio_rental_items_per_period`
- Audio must have available licenses (`total_rented` < `purchased_rental_license_limit`)
- Company must have sufficient credits
- If no licenses available, automatically purchases new license from Findaway

**Activity Log Meta Structure**:
```json
{
  "credit_used": 1,
  "start_time": "2026-01-12T10:00:00Z",
  "end_time": "2026-01-26T10:00:00Z"
}
```

**Response**: Returns the created/updated `UserAudioStatus` record with `rental_expire_at` timestamp

**Example Flow**:
```
User clicks "Rent" → API call → Check rental limits → Check company credits →
Check available licenses → Purchase license if needed → Checkout license from Findaway →
Create/update user_audio_statuses → Increment total_rented → Deduct credits →
Log activity → Sync to Elasticsearch → Return status
```

---

### 4. RENEW Action

**Purpose**: Extend the rental period for an already-rented audio.

**API Endpoint**: `POST /user-audios/:audioId/actions/renew`

**Service Method**: `UserAudioService.renewRentedAudio(audioId, user)`

**Credit Cost**: Configurable (default: 1 credit from `audio_rental_credit_cost` config)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | UPDATE | `rental_expire_at`, `updated_at` | Current expire + rental_period, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, audioId, 'audio', 'renew', `{credit_used, start_time, end_time}`, NOW() |
| `audios2` | UPDATE | `total_rented` | INCREMENT by 1 |
| `companies` | UPDATE | `available_credits` | DECREMENT by credit cost |

**Validation Rules**:
- Audio must have `status` = 'rented' for the user
- Audio must have available licenses (`total_rented` < `purchased_rental_license_limit`)
- Company must have sufficient credits
- If no licenses available, automatically purchases new license from Findaway

**Activity Log Meta Structure**:
```json
{
  "credit_used": 1,
  "start_time": "2026-01-26T10:00:00Z",
  "end_time": "2026-02-09T10:00:00Z"
}
```

**Response**: Returns the updated `UserAudioStatus` record with new `rental_expire_at`

**Example Flow**:
```
User clicks "Renew" → API call → Find rented audio → Check licenses →
Purchase if needed → Checkout from Findaway → Extend rental_expire_at →
Increment total_rented → Deduct credits → Log activity → Return status
```

---

### 5. RETURN Action

**Purpose**: Return a rented audio before its expiration date.

**API Endpoint**: `POST /user-audios/:audioId/actions/return`

**Service Method**: `UserAudioService.returnRentedAudio(audioId, user)`

**Credit Cost**: 0 (No refund of rental credits)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | UPDATE | `rental_expire_at`, `updated_at` | NOW(), NOW() |
| `user_activity_logs` | UPDATE | `meta.end_time` | NOW() (updates the original rent log) |

**Validation Rules**:
- Audio must have `status` = 'rented' for the user
- Must belong to the requesting user

**Response**: Returns the updated `UserAudioStatus` record

**Example Flow**:
```
User clicks "Return" → API call → Find rented audio →
Update rental_expire_at to NOW() → Update activity log end_time → Return status
```

---

### 6. BOOKSHELF/KEEP Action

**Purpose**: Permanently purchase an audio for unlimited access.

**API Endpoint**: `POST /user-audios/:audioId/actions/bookself`

**Service Method**: `UserAudioService.bookselfAudio(audioId, user)`

**Credit Cost**: Variable (defined in `Audio.bookshelf_credit_cost` field)

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audio_statuses` | INSERT or UPDATE | `id`, `user_id`, `audio_id`, `status`, `license_id`, `updated_at` | ULID, user.id, audioId, 'bookshelved', licenseId, NOW() |
| `user_activity_logs` | INSERT | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at` | user.id, audioId, 'audio', 'keep', `{credit_used, keep_at}`, NOW() |
| `companies` | UPDATE | `available_credits` | DECREMENT by bookshelf_credit_cost |

**Validation Rules**:
- User's daily purchase count must be below `max_audio_purchase_per_day` (default: 2)
- User cannot already have this audio with `status` = 'bookshelved'
- Company must have sufficient credits (≥ bookshelf_credit_cost)
- Purchases retail license from Findaway

**Activity Log Meta Structure**:
```json
{
  "credit_used": 5,
  "keep_at": "2026-01-12T10:00:00Z"
}
```

**Response**: Returns the created/updated `UserAudioStatus` record

**Example Flow**:
```
User clicks "Add to Bookshelf" → API call → Check daily purchase limit →
Check company credits → Purchase retail license from Findaway →
Create/update user_audio_statuses → Deduct credits → Log activity → Return status
```

---

## Playback Tracking

The audio system tracks user playback positions and listening activity through PLAY and PAUSE events. This enables resume functionality and analytics on listening behavior.

### 7. PLAY Event

**Purpose**: Record when a user starts or resumes playing an audio, and track playback analytics.

**API Endpoint**: `POST /audios/:id/trigger-event/play`

**Service Method**: `AudioService.triggerAudioPlayerEvent(audioId, 'play', payload, user)`

**Credit Cost**: 0 (Free action)

**Request Payload**:
```json
{
  "part_number": 1,
  "chapter_number": 3,
  "play_position": 120
}
```

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_activity_logs` | INSERT or UPDATE | `user_id`, `item_id`, `item_type`, `action`, `meta`, `created_at`, `updated_at` | user.id, audioId, 'audio', 'play', play metadata, NOW(), NOW() |
| `audios2` | UPDATE | `total_played` | INCREMENT by 1 (once per day per user) |

**Validation Rules**:
- Audio must exist and be active
- Chapter must exist in the audio metadata
- `play_position` must not exceed chapter duration
- User must have rented or bookshelved the audio to access playlist

**Activity Log Meta Structure**:
```json
{
  "start_part_number": 1,
  "start_chapter_number": 1,
  "start_position": 0,
  "end_part_number": 1,
  "end_chapter_number": 3,
  "end_position": 120,
  "total_time_played": 7320
}
```

**Behavior**:
- **First play of the day**: Creates new activity log with start position
- **Subsequent plays same day**: Updates existing activity log, adjusting `start_*` values to earliest position
- **Play counter**: Increments `audios2.total_played` only once per day per user
- **Total time calculation**: Automatically calculates time between start and end positions across chapters

**Response**: HTTP 200 (no body returned)

**Example Flow**:
```
User starts playing audio → API call → Validate chapter exists →
Check for existing play activity today →
If exists: Update start/end positions, recalculate total_time_played →
If new: Create activity log, increment total_played →
Return success
```

---

### 8. PAUSE Event

**Purpose**: Update playback position when user pauses, enabling resume functionality.

**API Endpoint**: `POST /audios/:id/trigger-event/pause`

**Service Method**: `AudioService.triggerAudioPlayerEvent(audioId, 'pause', payload, user)`

**Credit Cost**: 0 (Free action)

**Request Payload**:
```json
{
  "part_number": 1,
  "chapter_number": 5,
  "play_position": 450
}
```

**Database Operations**:

| Table | Operation | Columns Affected | Values |
|-------|-----------|------------------|---------|
| `user_audioplayer_positions` | INSERT or UPDATE | `id`, `user_id`, `audio_id`, `part_number`, `chapter_number`, `play_position`, `updated_at` | ULID, user.id, audioId, part#, chapter#, position, NOW() |
| `user_activity_logs` | UPDATE | `meta.end_*`, `meta.total_time_played`, `updated_at` | Updated end position and calculated time, NOW() |

**Validation Rules**:
- Audio must exist and be active
- Chapter must exist in the audio metadata
- `play_position` must not exceed chapter duration

**Activity Log Meta Update**:
The most recent PLAY activity log is updated with:
```json
{
  "start_part_number": 1,
  "start_chapter_number": 1,
  "start_position": 0,
  "end_part_number": 1,
  "end_chapter_number": 5,
  "end_position": 450,
  "total_time_played": 14250
}
```

**Behavior**:
- **Upsert position**: Creates or updates user's playback position
- **Activity log update**: Finds latest PLAY activity and updates end position
- **Resume functionality**: Position is retrieved when user requests playlist
- **Time calculation**: Recalculates `total_time_played` from start to new end position

**Response**: HTTP 200 (no body returned)

**Example Flow**:
```
User pauses audio → API call → Validate chapter exists →
Upsert user_audioplayer_positions record →
Find latest play activity log → Update end position and total_time_played →
Return success
```

---

### Playback Position Tracking Details

**How Resume Works**:

1. User requests playlist via `GET /audios/:id/playlist`
2. System retrieves `user_audioplayer_positions` record for user+audio
3. Returns last known position in response:
```json
{
  "audio_metadata": {...},
  "audio_player_data": {
    "chapter_number": 5,
    "part_number": 1,
    "play_position": 450
  },
  "playlist": {...}
}
```
4. Client resumes playback from this position

**Total Time Played Calculation**:

The system calculates total listening time by:
1. Identifying all chapters between start and end positions
2. For start chapter: `chapter.duration - start_position`
3. For end chapter: `end_position`
4. For middle chapters: Full `chapter.duration`
5. Sum all durations for total time

**Example**:
```
Chapters: [
  {part: 1, ch: 1, duration: 600},
  {part: 1, ch: 2, duration: 550},
  {part: 1, ch: 3, duration: 720}
]

User plays from:
  start: {part: 1, ch: 1, position: 100}
  end:   {part: 1, ch: 3, position: 120}

Calculation:
  Chapter 1: 600 - 100 = 500
  Chapter 2: 550 (full chapter)
  Chapter 3: 120
  Total: 500 + 550 + 120 = 1170 seconds
```

**Daily Activity Consolidation**:

- One activity log per user per audio per day
- PLAY events update the earliest start position
- PAUSE events update the latest end position
- Total time reflects the span from earliest to latest position in that day
- New day = new activity log entry

---

## Database Schema

### Table: `audios2`

**Purpose**: Stores core audio/audiobook catalog data.

**Primary Key**: `id` (VARCHAR 35) - ULID format: `audio_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(35) | NO | - | Primary key (ULID) |
| `sku` | VARCHAR | YES | NULL | Stock Keeping Unit, FK to audio_metadata2 |
| `is_active` | BOOLEAN | NO | true | Whether audio is available in catalog |
| `is_excluded` | BOOLEAN | NO | false | Excluded from general catalog |
| `is_featured` | BOOLEAN | NO | false | Featured in UI |
| `bookshelf_credit_cost` | INT | NO | 0 | Cost in credits to purchase/keep |
| `display_title` | VARCHAR | YES | NULL | Override title for display |
| `display_authors` | JSONB | YES | NULL | Array of author names override |
| `display_description` | TEXT | YES | NULL | Override description |
| `display_short_description` | TEXT | YES | NULL | Short description override |
| `display_copyright` | VARCHAR | YES | NULL | Copyright information |
| `purchased_rental_license_limit` | INT | NO | 0 | Maximum rental licenses available |
| `total_rented` | INT | NO | 0 | Current count of active rentals |
| `avg_rating` | FLOAT | NO | 0 | Average user rating |
| `deep_link` | TEXT | YES | NULL | Deep link URL |
| `is_only_for_purchase` | BOOLEAN | NO | true | Cannot be rented, only purchased |
| `is_new_trl` | BOOLEAN | NO | false | New item flag |
| `categories` | JSONB | NO | [] | Array of category IDs |
| `suggestions` | JSONB | NO | [] | Array of suggested audio IDs |
| `total_played` | BIGINT | NO | 0 | Total play counter |
| `activated_at` | TIMESTAMP | YES | NULL | When audio was activated |
| `curated_at` | TIMESTAMP | YES | NULL | When audio was curated |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `deleted_at` | TIMESTAMP | YES | NULL | Soft delete timestamp |

**Indexes**:
- `IDX_AUDIOS_SKU` (UNIQUE on `sku`)
- `IDX_AUDIOS_IS_ACTIVE` (on `is_active`)
- `IDX_AUDIOS_IS_FEATURED` (on `is_featured`)
- `IDX_AUDIOS_IS_EXCLUDED` (on `is_excluded`)
- `IDX_AUDIOS_BOOKSHELF_CREDIT_COST` (on `bookshelf_credit_cost`)

**Foreign Keys**:
- `sku` → `audio_metadata2.sku` (SET NULL on delete)

**Modified By Actions**:
- **RENT**: `total_rented` incremented
- **RENEW**: `total_rented` incremented

---

### Table: `audio_metadata2`

**Purpose**: Stores detailed metadata about audiobooks from Findaway.

**Primary Key**: `sku` (VARCHAR)

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `sku` | VARCHAR | NO | - | Primary key, Findaway SKU |
| `title` | VARCHAR(255) | NO | - | Audiobook title |
| `authors` | JSONB | NO | [] | Array of author names |
| `isbn` | VARCHAR | YES | NULL | ISBN identifier |
| `publisher` | VARCHAR | YES | NULL | Publisher name |
| `description` | TEXT | YES | NULL | Full description |
| `language` | VARCHAR | YES | NULL | Language code |
| `actual_size` | BIGINT | NO | 0 | File size in bytes |
| `narrators` | JSONB | NO | [] | Array of narrator names |
| `abridgement` | VARCHAR | YES | NULL | Abridgement status |
| `bisac_codes` | JSONB | YES | NULL | BISAC classification codes |
| `runtime` | VARCHAR | YES | NULL | Total runtime string |
| `product_id` | VARCHAR | YES | NULL | Findaway library product ID |
| `retail_product_id` | VARCHAR | YES | NULL | Findaway retail product ID |
| `metadata_signature` | VARCHAR | YES | NULL | Metadata hash signature |
| `findaway_price` | FLOAT | YES | NULL | Library rental list price |
| `findaway_content_cost` | FLOAT | YES | NULL | Library content cost |
| `findaway_retail_price` | FLOAT | YES | NULL | Retail list price |
| `findaway_retail_content_cost` | FLOAT | YES | NULL | Retail content cost |
| `available_for` | ENUM | NO | 'both' | 'rental', 'purchasable', 'both' |
| `street_date` | DATE | YES | NULL | Release date |
| `is_for_sale` | BOOLEAN | YES | NULL | Available for sale |
| `sales_locations` | JSONB | YES | NULL | Library sales locations array |
| `retail_sales_locations` | JSONB | YES | NULL | Retail sales locations array |
| `copyright` | VARCHAR | YES | NULL | Copyright information |
| `sample_url` | TEXT | YES | NULL | Sample audio URL |
| `cover_url` | TEXT | YES | NULL | Cover image URL |
| `sub_title` | TEXT | YES | NULL | Subtitle |
| `chapters` | JSONB | NO | [] | Array of chapter objects |
| `purchased_rental_licenses` | INT | NO | 0 | Number of rental licenses purchased |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `deleted_at` | TIMESTAMP | YES | NULL | Soft delete timestamp |

**Chapter Object Structure**:
```json
{
  "part_number": 1,
  "chapter_number": 1,
  "duration": 3600
}
```

**Indexes**:
- `IDX_AUDIO_METADATA_STREET_DATE` (on `street_date`)
- `IDX_AUDIO_METADATA_FINDWAY_RETAIL_PRICE` (on `findaway_retail_price`)
- `IDX_AUDIO_METADATA_FINDWAY_RETAIL_CONTENT_COST` (on `findaway_retail_content_cost`)
- `IDX_AUDIO_METADATA_PUBLISHER` (on `publisher`)

**Modified By Actions**: Read-only (used for reference data)

---

### Table: `user_audio_statuses`

**Purpose**: Junction table tracking the relationship between users and audios (queued/rented/bookshelved).

**Primary Key**: `id` (VARCHAR 255) - ULID format: `user_audio_status_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(255) | NO | - | Primary key (ULID) |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `audio_id` | VARCHAR | NO | - | FK to audios2 table |
| `status` | ENUM | NO | 'queued' | 'queued', 'rented', 'bookshelved' |
| `license_id` | VARCHAR | YES | NULL | Findaway license ID |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `rental_expire_at` | TIMESTAMP | YES | NULL | Rental expiration (rented status only) |

**Constraints**:
- UNIQUE (`audio_id`, `user_id`) - One status per user-audio pair

**Indexes**:
- `IDX_USER_AUDIO_STATUSES_AUDIO_ID` (on `audio_id`)
- `IDX_USER_AUDIO_STATUSES_USER_ID` (on `user_id`)

**Foreign Keys**:
- `user_id` → `users.id` (CASCADE delete)
- `audio_id` → `audios2.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with status='queued'
- **DEQUEUE**: DELETE where status='queued'
- **RENT**: INSERT/UPDATE with status='rented', sets rental_expire_at
- **RENEW**: UPDATE rental_expire_at
- **RETURN**: UPDATE rental_expire_at to NOW()
- **BOOKSHELF**: INSERT/UPDATE with status='bookshelved'

---

### Table: `user_audioplayer_positions`

**Purpose**: Tracks user playback position for resume functionality.

**Primary Key**: `id` (VARCHAR 55) - ULID format: `user_audioplayer_position_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(55) | NO | - | Primary key (ULID) |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `audio_id` | VARCHAR | NO | - | FK to audios2 table |
| `part_number` | INT | YES | NULL | Current part number (multi-part audiobooks) |
| `chapter_number` | INT | YES | NULL | Current chapter number |
| `play_position` | INT | YES | NULL | Position in seconds within chapter |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Constraints**:
- UNIQUE (`user_id`, `audio_id`) - One position per user-audio pair

**Foreign Keys**:
- `user_id` → `users.id` (CASCADE delete)
- `audio_id` → `audios2.id` (CASCADE delete)

**Modified By Actions**:
- **PLAY/PAUSE**: Updated via separate player event handlers (not in UserAudioService)

---

### Table: `user_activity_logs`

**Purpose**: Comprehensive log of all user actions across all media types.

**Primary Key**: `id` (INT) - Auto-increment

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | INT | NO | AUTO | Primary key |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `item_id` | VARCHAR | NO | - | ID of audio/video/pharma item |
| `item_type` | ENUM | NO | 'audio' | 'audio', 'video', 'pharma' |
| `action` | ENUM | NO | - | 'queue', 'rent', 'keep', 'play', 'renew', 'return', 'video_player_event' |
| `meta` | JSONB | YES | NULL | Action-specific metadata |
| `created_at` | TIMESTAMP | NO | NOW() | When action occurred |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |

**Meta Object Structure for Audio Actions**:

```typescript
interface AudioActivityMeta {
  // For all actions
  credit_used?: number;           // Credits consumed (0 for queue)

  // For RENT and RENEW
  start_time?: Date;              // Rental start timestamp
  end_time?: Date;                // Rental end timestamp

  // For BOOKSHELF/KEEP
  keep_at?: Date;                 // When audio was added to bookshelf

  // For PLAY events (if tracked)
  start_part_number?: number;     // Starting part
  start_chapter_number?: number;  // Starting chapter
  start_position?: number;        // Starting position in seconds
  end_part_number?: number;       // Ending part
  end_chapter_number?: number;    // Ending chapter
  end_position?: number;          // Ending position in seconds
  total_time_played?: number;     // Total playback duration in seconds
}
```

**Foreign Keys**:
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**:
- **QUEUE**: INSERT with action='queue', meta={credit_used: 0}
- **RENT**: INSERT with action='rent', meta={credit_used, start_time, end_time}
- **BOOKSHELF**: INSERT with action='keep', meta={credit_used, keep_at}
- **RENEW**: INSERT with action='renew', meta={credit_used, start_time, end_time}
- **RETURN**: UPDATE existing RENT record's meta.end_time

---

### Table: `audio_reviews`

**Purpose**: User ratings and reviews for audiobooks.

**Primary Key**: `id` (VARCHAR 45) - ULID format: `audio_review_*`

**Full Schema**:

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | VARCHAR(45) | NO | - | Primary key (ULID) |
| `audio_id` | VARCHAR | NO | - | FK to audios2 table |
| `user_id` | VARCHAR | NO | - | FK to users table |
| `rate` | INT | NO | - | Rating score (typically 1-5) |
| `review` | TEXT | YES | NULL | Review text |
| `created_at` | TIMESTAMP | NO | NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | NOW() | Last update timestamp |
| `deleted_at` | TIMESTAMP | YES | NULL | Soft delete timestamp |

**Constraints**:
- UNIQUE (`audio_id`, `user_id`) - One review per user-audio pair

**Indexes**:
- `IDX_AUDIO_REVIEWS_AUDIO_ID` (on `audio_id`)
- `IDX_AUDIO_REVIEWS_USER_ID` (on `user_id`)

**Foreign Keys**:
- `audio_id` → `audios2.id` (CASCADE delete)
- `user_id` → `users.id` (CASCADE delete)

**Modified By Actions**: Separate review API (not part of queue/rent/bookshelf flow)

---

### Table: `companies`

**Purpose**: Company/organization configuration and credit management.

**Columns Affected by Audio Actions**:

| Column Name | Type | Description |
|------------|------|-------------|
| `id` | VARCHAR | Primary key |
| `available_credits` | INT | Total credits available for users |

**Modified By Actions**:
- **RENT**: DECREMENT by `audio_rental_credit_cost`
- **RENEW**: DECREMENT by `audio_rental_credit_cost`
- **BOOKSHELF**: DECREMENT by `Audio.bookshelf_credit_cost`

---

## Data Flow by Action

### QUEUE Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-audios/:audioId/actions/queue                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ UserAudioService     │
           │ .queueAudio()        │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Audio exists          │
        │ - Not already queued    │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ INSERT user_audio_statuses │
    │ - id: ULID                 │
    │ - user_id: user.id         │
    │ - audio_id: audioId        │
    │ - status: 'queued'         │
    │ - updated_at: NOW()        │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ INSERT user_activity_logs  │
    │ - user_id: user.id         │
    │ - item_id: audioId         │
    │ - item_type: 'audio'       │
    │ - action: 'queue'          │
    │ - meta: {credit_used: 0}   │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Return UserAudioStatus     │
    └────────────────────────────┘
```

---

### RENT Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-audios/:audioId/actions/rent                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ UserAudioService     │
           │ .rentAudio()         │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Validate:                       │
        │ - Audio is rentable             │
        │ - User rental limits OK         │
        │ - Company has credits           │
        │ - Licenses available            │
        └────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Check License Availability         │
    │ If total_rented >=                 │
    │   purchased_rental_license_limit:  │
    │   → Purchase license from Findaway │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Findaway Audio Engine              │
    │ POST /audiobooks/{sku}/checkout    │
    │ - Get license_id                   │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT/UPDATE user_audio_statuses  │
    │ - id: ULID                         │
    │ - user_id: user.id                 │
    │ - audio_id: audioId                │
    │ - status: 'rented'                 │
    │ - license_id: licenseId            │
    │ - rental_expire_at: NOW() +        │
    │   rental_period_days               │
    │ - updated_at: NOW()                │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE audios2                     │
    │ SET total_rented =                 │
    │     total_rented + 1               │
    │ WHERE id = audioId                 │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE companies                   │
    │ SET available_credits =            │
    │     available_credits - cost       │
    │ WHERE id = user.company_id         │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - user_id: user.id                 │
    │ - item_id: audioId                 │
    │ - item_type: 'audio'               │
    │ - action: 'rent'                   │
    │ - meta: {                          │
    │     credit_used: cost,             │
    │     start_time: NOW(),             │
    │     end_time: rental_expire_at     │
    │   }                                │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Sync to Elasticsearch              │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Return UserAudioStatus             │
    └────────────────────────────────────┘
```

---

### BOOKSHELF/KEEP Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /user-audios/:audioId/actions/bookself                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ UserAudioService     │
           │ .bookselfAudio()     │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────────────┐
        │ Validate:                       │
        │ - Daily purchase limit OK       │
        │ - Not already bookshelved       │
        │ - Company has credits           │
        └────────┬────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Findaway Audio Engine              │
    │ POST /audiobooks/{id}/purchase     │
    │ - Purchase retail license          │
    │ - Get license_id                   │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT/UPDATE user_audio_statuses  │
    │ - id: ULID                         │
    │ - user_id: user.id                 │
    │ - audio_id: audioId                │
    │ - status: 'bookshelved'            │
    │ - license_id: licenseId            │
    │ - updated_at: NOW()                │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ UPDATE companies                   │
    │ SET available_credits =            │
    │     available_credits -            │
    │     bookshelf_credit_cost          │
    │ WHERE id = user.company_id         │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ INSERT user_activity_logs          │
    │ - user_id: user.id                 │
    │ - item_id: audioId                 │
    │ - item_type: 'audio'               │
    │ - action: 'keep'                   │
    │ - meta: {                          │
    │     credit_used: cost,             │
    │     keep_at: NOW()                 │
    │   }                                │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │ Return UserAudioStatus             │
    └────────────────────────────────────┘
```

---

### PLAY Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /audios/:id/trigger-event/play                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ AudioService         │
           │ .triggerAudioPlayer  │
           │ Event('play')        │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Audio exists          │
        │ - Chapter exists        │
        │ - Position valid        │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Check for existing play activity   │
    │ today (DATE(created_at) = today)   │
    └────────┬───────────────────────────┘
             │
             ├───── Existing? ─────┐
             │                      │
             ▼ YES                  ▼ NO
    ┌────────────────────┐   ┌────────────────────┐
    │ UPDATE activity    │   │ CREATE activity    │
    │ - Update start_*   │   │ - Set start_*      │
    │   to earliest pos  │   │ - total_time = 0   │
    │ - Recalc time      │   │                    │
    └────────┬───────────┘   └────────┬───────────┘
             │                        │
             └────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │ INCREMENT audios2          │
         │ SET total_played =         │
         │     total_played + 1       │
         │ (once per day per user)    │
         └────────┬───────────────────┘
                  │
                  ▼
         ┌────────────────────────────┐
         │ Return HTTP 200            │
         └────────────────────────────┘
```

---

### PAUSE Flow

```
┌─────────────────────────────────────────────────────────────┐
│ POST /audios/:id/trigger-event/pause                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
           ┌──────────────────────┐
           │ AudioService         │
           │ .triggerAudioPlayer  │
           │ Event('pause')       │
           └──────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │ Validate:               │
        │ - Audio exists          │
        │ - Chapter exists        │
        │ - Position valid        │
        └────────┬────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Find existing                      │
    │ user_audioplayer_positions         │
    │ WHERE user_id + audio_id           │
    └────────┬───────────────────────────┘
             │
             ├───── Exists? ──────┐
             │                     │
             ▼ YES                 ▼ NO
    ┌────────────────┐   ┌────────────────────┐
    │ UPDATE record  │   │ INSERT new record  │
    │ - part_number  │   │ - user_id          │
    │ - chapter_num  │   │ - audio_id         │
    │ - play_pos     │   │ - part_number      │
    │ - updated_at   │   │ - chapter_number   │
    └────────┬───────┘   │ - play_position    │
             │            └────────┬───────────┘
             │                     │
             └──────────┬──────────┘
                        │
                        ▼
           ┌────────────────────────────┐
           │ Find latest PLAY activity  │
           │ WHERE user_id + audio_id   │
           │ ORDER BY created_at DESC   │
           └────────┬───────────────────┘
                    │
                    ▼ (if found)
           ┌────────────────────────────┐
           │ UPDATE activity log        │
           │ - Update end_part_number   │
           │ - Update end_chapter_num   │
           │ - Update end_position      │
           │ - Recalc total_time_played │
           │ - updated_at = NOW()       │
           └────────┬───────────────────┘
                    │
                    ▼
           ┌────────────────────────────┐
           │ Return HTTP 200            │
           └────────────────────────────┘
```

---

## Entity Relationships

```
┌──────────────┐
│   companies  │
│              │
│ - id         │◄──────────┐
│ - available_ │           │
│   credits    │           │ FK: company_id
└──────────────┘           │
                           │
                    ┌──────┴──────┐
                    │    users    │
                    │             │
                    │ - id        │
                    │ - company_id│
                    └──────┬──────┘
                           │
                           │ FK: user_id
        ┌──────────────────┼──────────────────┬─────────────┐
        │                  │                  │             │
        ▼                  ▼                  ▼             ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│user_audio_    │  │user_activity_│  │user_audio    │  │audio_reviews│
│  statuses     │  │     logs     │  │  player_     │  │             │
│               │  │              │  │  positions   │  │ - audio_id  │
│ - user_id     │  │ - user_id    │  │ - user_id    │  │ - user_id   │
│ - audio_id    │  │ - item_id    │  │ - audio_id   │  │ - rate      │
│ - status      │  │ - action     │  │ - part_num   │  │ - review    │
│ - license_id  │  │ - meta       │  │ - chapter_num│  └──────┬──────┘
│ - rental_     │  └──────────────┘  │ - play_pos   │         │
│   expire_at   │                    └──────┬───────┘         │
└───────┬───────┘                           │                 │
        │                                   │                 │
        │ FK: audio_id                      │ FK: audio_id    │ FK: audio_id
        └───────────────────────────────────┼─────────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │   audios2    │
                                    │              │
                                    │ - id         │
                                    │ - sku        │──┐ FK: sku
                                    │ - bookshelf_ │  │
                                    │   credit_cost│  │
                                    │ - total_rented  │
                                    │ - categories │  │
                                    └──────────────┘  │
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │audio_metadata2  │
                                            │                 │
                                            │ - sku (PK)      │
                                            │ - title         │
                                            │ - authors       │
                                            │ - chapters      │
                                            │ - product_id    │
                                            │ - retail_       │
                                            │   product_id    │
                                            └─────────────────┘
```

**Relationship Summary**:
- **One User** → **Many UserAudioStatuses** (user can have multiple audios)
- **One Audio** → **Many UserAudioStatuses** (audio can be used by many users)
- **One Audio** → **One AudioMetadata** (1:1 relationship via SKU)
- **One User** → **Many UserActivityLogs** (tracks all actions)
- **One User + One Audio** → **One UserAudioplayerPosition** (unique position)
- **One User + One Audio** → **One AudioReview** (one review per user-audio)
- **One Company** → **Many Users** (company manages multiple users)

---

## Configuration & Credits

### Company Configuration (AppConfig)

The audio system behavior is controlled by configuration values stored per company:

| Config Key | Type | Default | Description |
|-----------|------|---------|-------------|
| `audio_rental_credit_cost` | INT | 1 | Credits deducted for RENT and RENEW actions |
| `audio_rental_period_in_days` | INT | 14 | Number of days for rental period |
| `max_audio_rental_items_on_hand` | INT | 1 | Maximum concurrent active rentals per user |
| `max_audio_rental_items_per_period` | INT | 1 | Maximum rentals within the period |
| `max_audio_purchase_per_day` | INT | 2 | Maximum bookshelf purchases per day per user |

### Credit System

**Credit Costs by Action**:
- **QUEUE**: 0 credits (free)
- **DEQUEUE**: 0 credits (free)
- **RENT**: Configurable (default: 1 credit)
- **RENEW**: Configurable (default: 1 credit)
- **RETURN**: 0 credits (no refund)
- **BOOKSHELF**: Variable per audio (`Audio.bookshelf_credit_cost`)

**Credit Flow**:
1. Company has total `available_credits` in `companies` table
2. When user performs RENT/RENEW/BOOKSHELF action:
   - System checks if `available_credits >= credit_cost`
   - If yes: Proceeds with action and updates `available_credits = available_credits - credit_cost`
   - If no: Rejects action with insufficient credits error
3. Credits are tracked in `user_activity_logs.meta.credit_used` field

**Credit Tracking Example**:
```sql
-- Company starts with 100 credits
SELECT available_credits FROM companies WHERE id = 'company_123';
-- Result: 100

-- User rents an audio (cost: 1 credit)
-- After rent:
SELECT available_credits FROM companies WHERE id = 'company_123';
-- Result: 99

-- Activity log shows:
SELECT meta FROM user_activity_logs WHERE action = 'rent';
-- Result: {"credit_used": 1, "start_time": "...", "end_time": "..."}
```

---

## API Endpoints

### Audio Catalog Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/audios` | List all available audios for user's company | JWT |
| GET | `/audio/home` | Get home page audio list | JWT |
| GET | `/audio-categories` | Get all audio categories | JWT |
| GET | `/audio-categories/:id/audios` | Get audios in specific category | JWT |
| GET | `/search/audios?query=X&page=1&per_page=20` | Search audios with pagination | JWT |
| GET | `/audios/:param` | Get by type (featured/queued/bookself/popular/new) or by ID | JWT |

### User Audio Action Endpoints

**Base Route**: `/user-audios` (Protected with JwtAuthGuard)

**Pattern**: `POST /user-audios/:audioId/actions/:action`

| Method | Endpoint | Description | Credit Cost | Service Method |
|--------|----------|-------------|-------------|----------------|
| POST | `/user-audios/:audioId/actions/queue` | Add audio to queue | 0 | `queueAudio()` |
| POST | `/user-audios/:audioId/actions/dequeue` | Remove from queue | 0 | `dequeueAudio()` |
| POST | `/user-audios/:audioId/actions/rent` | Rent audio | Configurable (default: 1) | `rentAudio()` |
| POST | `/user-audios/:audioId/actions/renew` | Renew rental | Configurable (default: 1) | `renewRentedAudio()` |
| POST | `/user-audios/:audioId/actions/return` | Return rented audio | 0 | `returnRentedAudio()` |
| POST | `/user-audios/:audioId/actions/bookself` | Add to bookshelf | Variable per audio | `bookselfAudio()` |

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response Format** (Success):
```json
{
  "id": "user_audio_status_01HQRS2...",
  "user_id": "user_01HQRS1...",
  "audio_id": "audio_01HQRS3...",
  "status": "rented",
  "license_id": "findaway_license_123",
  "rental_expire_at": "2026-01-26T10:00:00Z",
  "updated_at": "2026-01-12T10:00:00Z"
}
```

**Error Response Format**:
```json
{
  "statusCode": 400,
  "message": "Insufficient credits",
  "error": "Bad Request"
}
```

### Audio Review Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/audios/:audioId/reviews` | Create/update audio review | JWT |
| GET | `/audios/:audioId/reviews` | Get reviews for audio | JWT |

### Audio Playback Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/audios/:id/playlist` | Get audio playlist and resume position | JWT |
| POST | `/audios/:id/trigger-event/play` | Record play event and track listening | JWT |
| POST | `/audios/:id/trigger-event/pause` | Save playback position on pause | JWT |

**Playlist Response Example**:
```json
{
  "audio_metadata": {
    "id": "audio_01HQRS3...",
    "title": "The Great Novel",
    "authors": ["Author Name"],
    "chapters": [...]
  },
  "audio_player_data": {
    "part_number": 1,
    "chapter_number": 5,
    "play_position": 450
  },
  "playlist": {
    "manifest": "https://...",
    "license_id": "findaway_license_123"
  }
}
```

**Trigger Event Request Example**:
```json
{
  "part_number": 1,
  "chapter_number": 5,
  "play_position": 450
}
```

---

## External Integrations

### Findaway Audio Engine API

The system integrates with Findaway's Audio Engine API for license management.

**Base Service**: `AudioEngineService` (located in `src/common/services/audio_engine.service.ts`)

#### 1. Purchase License Endpoint

**Used By**: RENT, RENEW actions (when licenses need to be purchased)

**Request**:
```
POST /audiobooks/{id}/purchase
Content-Type: application/json

{
  "quantity": 1,
  "product_id": "findaway_product_123",
  "purchase_price": 29.99
}
```

**Response**:
```json
{
  "license_id": "findaway_license_abc123",
  "status": "purchased"
}
```

#### 2. Get License Endpoint

**Used By**: RENT, RENEW actions (to find available licenses)

**Request**:
```
GET /accounts/{accountId}/audiobooks/{id}
```

**Response**:
```json
{
  "licenses": [
    {
      "license_id": "findaway_license_abc123",
      "status": "available"
    }
  ]
}
```

#### 3. Checkout License Endpoint

**Used By**: RENT, RENEW actions (to assign license to user)

**Request**:
```
POST /audiobooks/{sku}/checkout
Content-Type: application/json

{
  "license_id": "findaway_license_abc123",
  "external_listener_id": "user_01HQRS1...",
  "loan_period_minutes": 20160
}
```

**Response**:
```json
{
  "license_id": "findaway_license_abc123",
  "checkout_url": "https://...",
  "expires_at": "2026-01-26T10:00:00Z"
}
```

#### 4. Purchase Retail License Endpoint

**Used By**: BOOKSHELF action

**Request**:
```
POST /audiobooks/{id}/purchase
Content-Type: application/json

{
  "quantity": 1,
  "retail_product_id": "findaway_retail_product_456",
  "purchase_price": 19.99
}
```

**Response**:
```json
{
  "license_id": "findaway_retail_license_xyz789",
  "status": "purchased",
  "permanent": true
}
```

---

## Enums and Constants

### Media Status Enum

Located in: `src/constants.ts`

```typescript
USER_MEDIA_STATUS = {
  QUEUED: 'queued',         // Audio in waiting list
  RENTED: 'rented',         // Audio currently rented with expiration
  BOOKSHELVED: 'bookshelved' // Audio permanently owned
}
```

### User Activity Action Enum

```typescript
USER_ACTIVITY = {
  QUEUE: 'queue',              // Add to queue
  RENT: 'rent',                // Rent audio
  KEEP: 'keep',                // Purchase/bookshelf audio
  PLAY: 'play',                // Audio playback event
  RENEW: 'renew',              // Extend rental period
  RETURN: 'return',            // Return rented audio
  VIDEO_PLAYER_EVENT: 'video_player_event' // Video events
}
```

### Media Type Enum

```typescript
MEDIA = {
  AUDIO: 'audio',
  VIDEO: 'video',
  PHARMA: 'pharma'
}
```

### Availability Type Enum

```typescript
MEDIA_AVAILABILITY_TYPE = {
  RENTAL: 'rental',           // Only available for rental
  PURCHASABLE: 'purchasable', // Only available for purchase
  BOTH: 'both'               // Available for both rental and purchase
}
```

---

## Summary Table: Action Impact Matrix

Quick reference for which tables are affected by each action:

| Action | user_audio_statuses | user_activity_logs | user_audioplayer_positions | audios2 | companies | Findaway API |
|--------|-------------------|-------------------|---------------------------|---------|-----------|-------------|
| **QUEUE** | INSERT | INSERT | - | - | - | - |
| **DEQUEUE** | DELETE | - | - | - | - | - |
| **RENT** | INSERT/UPDATE | INSERT | - | +1 total_rented | -credits | CHECKOUT |
| **RENEW** | UPDATE | INSERT | - | +1 total_rented | -credits | CHECKOUT |
| **RETURN** | UPDATE | UPDATE | - | - | - | - |
| **BOOKSHELF** | INSERT/UPDATE | INSERT | - | - | -credits | PURCHASE |
| **PLAY** | - | INSERT/UPDATE | - | +1 total_played* | - | - |
| **PAUSE** | - | UPDATE | INSERT/UPDATE | - | - | - |

**Legend**:
- `INSERT`: New record created
- `UPDATE`: Existing record modified
- `DELETE`: Record removed
- `-credits`: available_credits decremented
- `+1 total_rented`: Counter incremented
- `+1 total_played*`: Counter incremented (once per day per user)
- `CHECKOUT`: License checkout API call
- `PURCHASE`: License purchase API call

---

## Code References

### Key Service Files
- User Audio Actions: [user-audio.service.ts](../users/user-audio.service.ts)
- Audio Management: [audio.service.ts](./audio.service.ts)
- Audio Engine Integration: [audio_engine.service.ts](../common/services/audio_engine.service.ts)

### Entity Files
- Audio Entity: [audio.entity.ts](./entities/audio.entity.ts)
- Audio Metadata: [audio_metadata.entity.ts](./entities/audio_metadata.entity.ts)
- User Audio Status: [user_audio_status.entity.ts](../users/entities/user_audio_status.entity.ts)
- Activity Log: [user_activity_log.entity.ts](../users/entities/user_activity_log.entity.ts)

### Controller Files
- User Audio Actions: [user-audio.controller.ts](../users/user-audio.controller.ts)
- Audio Catalog: [audio.controller.ts](./audio.controller.ts)

---

**Document Version**: 1.1
**Last Updated**: 2026-01-14
**Maintained By**: Development Team
**Changelog**:
- v1.1 (2026-01-14): Added comprehensive playback tracking documentation (PLAY/PAUSE events, position tracking, resume functionality)
- v1.0 (2026-01-12): Initial documentation with core actions (Queue, Rent, Bookshelf, etc.)
