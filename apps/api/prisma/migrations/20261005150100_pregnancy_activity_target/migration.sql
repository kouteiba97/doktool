-- A pregnancy view points at its substance, like the other views point at their target.
ALTER TABLE "recent_activities" DROP CONSTRAINT "recent_activities_target_chk";
ALTER TABLE "recent_activities"
  ADD CONSTRAINT "recent_activities_target_chk"
    CHECK (("kind" = 'SEARCH' AND "target_type" IS NULL AND "target_id" IS NULL)
       OR ("kind" = 'REFERENCE_VIEW' AND "target_type" = 'REFERENCE_DOCUMENT' AND "target_id" IS NOT NULL)
       OR ("kind" = 'CALCULATOR_USE' AND "target_type" = 'CALCULATOR' AND "target_id" IS NOT NULL)
       OR ("kind" = 'PREGNANCY_VIEW' AND "target_type" = 'SUBSTANCE' AND "target_id" IS NOT NULL));
