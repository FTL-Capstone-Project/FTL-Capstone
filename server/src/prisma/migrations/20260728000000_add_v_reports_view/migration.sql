-- v_reports: the ONLY relation the natural-language SQL assistant (features/nlpQuery) is allowed
-- to read. It flattens a submission + its global indicator + the org's private review into one row
-- of SHAREABLE columns, so the LLM can write ordinary SELECT/GROUP BY against a friendly, safe
-- shape instead of the raw tables.
--
-- SECURITY — why a view is the boundary:
--   • It exposes ONLY non-sensitive columns. Deliberately OMITTED: Clerk user/org ids,
--     User.apiKeyHash, User.email, rawUrl/finalUrl (can carry private tokens/intranet hosts),
--     canonicalKey, screenshotUrl. What's here is what Team History / the dashboard already show.
--   • Every row carries org_id + reporter_user_id, so the app layer can force a scope predicate
--     (WHERE org_id = $caller_org AND visibility) that the LLM's SQL cannot remove — the executor
--     wraps the model's query and the sql guard forbids referencing any relation but this view.
--   • It is READ-ONLY by nature (a view over joins); the executor also runs in a READ ONLY tx.
--
-- Grain: ONE ROW PER SUBMISSION (not per indicator). "this week", "by reporter", "web vs email"
-- are all per-report questions, so the submission is the right grain; de-duping to unique links is
-- done in the app formatter when a question needs it (same as the rest of the dashboard).
--
-- Idempotent (CREATE OR REPLACE) so `prisma migrate deploy` can re-run it safely on every deploy.

CREATE OR REPLACE VIEW "v_reports" AS
SELECT
  s."id"            AS submission_id,
  s."orgId"         AS org_id,             -- scope key (app injects WHERE org_id = caller's org)
  s."userId"        AS reporter_user_id,   -- scope key for the member privacy gate
  u."name"          AS reporter,           -- display name only (never the email)
  s."indicatorId"   AS indicator_id,
  s."createdAt"     AS reported_at,        -- what "this week"/"today"/date filters mean
  s."source"        AS channel,            -- 'web' | 'email'
  i."domain"        AS domain,
  i."finalHost"     AS final_host,         -- landing host (safe cue; not the full URL)
  i."aiScore"       AS score,              -- 0-100 safety score (100 = safe)
  -- verdict band, computed with the SAME thresholds as services/verdict.js scoreBucket()
  CASE
    WHEN i."aiScore" IS NULL   THEN 'suspicious'
    WHEN i."aiScore" >= 70     THEN 'safe'
    WHEN i."aiScore" >= 35     THEN 'suspicious'
    ELSE 'dangerous'
  END               AS verdict,
  i."aiConfidence"  AS confidence,         -- 'low' | 'medium' | 'high'
  i."aiTitle"       AS title,
  i."aiTags"        AS attack_tags,        -- jsonb array of category strings
  i."domainAgeDays" AS domain_age_days,
  i."blacklistHit"  AS blacklisted,
  i."redirectedToDifferentHost" AS redirected,
  i."reportedCount" AS reported_count,     -- how many users flagged this indicator (repeat-offender signal)
  orv."reviewStatus"  AS review_status,    -- 'pending review' | 'investigating' | 'confirmed malicious' | 'confirmed safe' | NULL
  orv."humanScore"    AS human_score,      -- analyst's authoritative score, if set
  orv."sharedWithOrg" AS shared_with_org   -- the member privacy gate flag
FROM "Submission" s
JOIN "Indicator" i     ON i."id" = s."indicatorId"
LEFT JOIN "User" u     ON u."id" = s."userId"
LEFT JOIN "OrgReview" orv ON orv."orgId" = s."orgId" AND orv."indicatorId" = s."indicatorId"
WHERE s."archivedAt" IS NULL;  -- archived submissions are hidden from the owner's views everywhere
