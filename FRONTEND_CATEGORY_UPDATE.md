# Frontend Update Required: Audio Category Logic Change

## Summary

The audio module has been updated to remove `category_0` logic and now matches the implementation pattern used in pharma and video modules. **Frontend code must be updated accordingly.**

## What Changed in Backend

### Before
- Audio module used a special category ID `category_0` to represent "All Categories"
- Frontend had to explicitly send `category_0` to get all audios

### After
- Audio module no longer uses `category_0` 
- Backend now handles "All Categories" the same way as pharma and video modules
- Frontend should send `null` or omit the category parameter to get all audios

---

## Required Frontend Changes

### 1. Update Category Selection Logic

**Before:**
```javascript
// OLD - Don't use this anymore
const categoryId = selectedCategory || 'category_0';
```

**After:**
```javascript
// NEW - Use null or undefined for all categories
const categoryId = selectedCategory || null;
// OR simply omit the parameter
```

### 2. Remove Hardcoded `category_0` References

Search your frontend codebase for any hardcoded `category_0` strings and remove them:

```bash
# Search for category_0 in your frontend code
grep -r "category_0" src/
```

Common places to check:
- Category dropdown/select components
- Audio list/grid components  
- API service calls
- Constants/config files
- Redux/state management files

### 3. Update API Calls

**Example: Fetching Audios by Category**

**Before:**
```javascript
// OLD - Don't use this
const response = await fetch(
  `/audio-categories/category_0/audios?page=1&per_page=20`
);
```

**After:**
```javascript
// NEW - For all categories, omit the category or use a generic endpoint
const response = await fetch(
  `/audio-categories/all/audios?page=1&per_page=20`
);

// OR for specific category
const response = await fetch(
  `/audio-categories/${categoryId}/audios?page=1&per_page=20`
);
```

### 4. Update Category Filter UI

**Before:**
```javascript
// OLD - Special case for "All Categories"
const categories = [
  { id: 'category_0', name: 'All Categories' },
  ...otherCategories
];
```

**After:**
```javascript
// NEW - "All Categories" is just a UI option, not a real category
const categories = [
  { id: null, name: 'All Categories' },  // or don't include it in the list
  ...otherCategories
];
```

---

## API Endpoint Behavior

### `/audio-categories/:id/audios`

| Parameter | Backend Behavior | Expected Response |
|-----------|------------------|-------------------|
| `id = null` or `id = undefined` | Returns all audios | `{ category: { id: null, title: "All categories" }, data: [...], meta: {...} }` |
| `id = valid_category_id` | Returns audios for that category | `{ category: { id: "cat_123", title: "Category Name" }, data: [...], meta: {...} }` |
| `id = category_0` | Transformed to `null` by backend | Same as `id = null` |

> **Note:** The backend will automatically transform `category_0` to `null` for backward compatibility, but you should update your frontend to stop sending it.

---

## Migration Checklist

- [ ] Remove all `category_0` hardcoded references
- [ ] Update category selection logic to use `null` for "All Categories"
- [ ] Update API service calls to handle null category
- [ ] Test category filtering:
  - [ ] "All Categories" option shows all audios
  - [ ] Specific category shows only audios from that category
  - [ ] Category switching works correctly
  - [ ] Pagination works with category filtering
- [ ] Update TypeScript types/interfaces if needed
- [ ] Test on all supported browsers/devices

---

## Consistency with Pharma and Video Modules

This change makes the audio module consistent with pharma and video modules, which already:
- ✅ Don't use `category_0`
- ✅ Handle "All Categories" via `null` category parameter
- ✅ Use the same DTO Transform pattern

**Check your pharma/video frontend code for reference** - the same pattern should now apply to audio!

---

## Example Code Updates

### React Example

**Before:**
```jsx
const AudioCategories = () => {
  const [selectedCategory, setSelectedCategory] = useState('category_0');
  
  return (
    <select onChange={(e) => setSelectedCategory(e.target.value)}>
      <option value="category_0">All Categories</option>
      {categories.map(cat => (
        <option key={cat.id} value={cat.id}>{cat.name}</option>
      ))}
    </select>
  );
};
```

**After:**
```jsx
const AudioCategories = () => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  return (
    <select onChange={(e) => setSelectedCategory(e.target.value || null)}>
      <option value="">All Categories</option>
      {categories.map(cat => (
        <option key={cat.id} value={cat.id}>{cat.name}</option>
      ))}
    </select>
  );
};
```

### API Service Example

**Before:**
```typescript
// OLD
export const fetchAudiosByCategory = async (categoryId: string = 'category_0') => {
  return api.get(`/audio-categories/${categoryId}/audios`);
};
```

**After:**
```typescript
// NEW
export const fetchAudiosByCategory = async (categoryId: string | null = null) => {
  const endpoint = categoryId 
    ? `/audio-categories/${categoryId}/audios`
    : `/audio-categories/all/audios`;
  return api.get(endpoint);
};
```

---

## Testing

After making frontend changes, verify:

1. **All Categories View**
   - Select "All Categories" option
   - Verify all audios are displayed
   - Check that no category filter is applied

2. **Specific Category View**
   - Select a specific category
   - Verify only audios from that category are shown
   - Check pagination works correctly

3. **Category Switching**
   - Switch between "All Categories" and specific categories
   - Verify the list updates correctly
   - Check URL parameters if using routing

---

## Questions?

If you have any questions about these changes or need help with the frontend updates, please reach out to the backend team.

**Backend Changes Implemented:** 2025-11-30
**Frontend Update Required:** ASAP
