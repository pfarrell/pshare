-- One-off repair: older album merges into a compilation carried the merged-in
-- album's 'primary' artist_albums row onto an album that artist doesn't own,
-- so the artist page never listed it. Re-role those rows as 'compilation'.
-- Preview first (SELECT), then run the UPDATE inside a transaction.

-- Preview
SELECT aa.id, aa.artist_id, ar.name AS artist, aa.album_id, al.title
FROM artist_albums aa
JOIN albums al ON al.id = aa.album_id
JOIN artists ar ON ar.id = aa.artist_id
WHERE aa.role = 'primary' AND al.is_compilation AND aa.artist_id != al.artist_id
ORDER BY aa.album_id, ar.name;

-- Repair
BEGIN;
UPDATE artist_albums aa
SET role = 'compilation'
FROM albums al
WHERE al.id = aa.album_id
  AND aa.role = 'primary' AND al.is_compilation AND aa.artist_id != al.artist_id;
-- check the row count, then COMMIT; (or ROLLBACK;)
