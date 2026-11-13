-- Administrator bootstrap is deliberately separate from app-role migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='pg_trgm' AND n.nspname='public'
  ) THEN
    RAISE EXCEPTION 'pg_trgm in public is required; run the explicit local extension bootstrap first'
      USING ERRCODE='55000';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.datascope_build_search_vector(
  p_dataset_id uuid, p_name text, p_status text, p_country text,
  p_category text, p_attributes jsonb
) RETURNS tsvector LANGUAGE sql VOLATILE
SET search_path=pg_catalog,public
AS $$
  SELECT to_tsvector('pg_catalog.simple'::regconfig,
    coalesce(string_agg(
      CASE f.field_key
        WHEN 'name' THEN p_name
        WHEN 'status' THEN p_status
        WHEN 'country' THEN p_country
        WHEN 'category' THEN p_category
        ELSE CASE WHEN jsonb_typeof(p_attributes->f.field_key)='string'
          THEN p_attributes->>f.field_key END
      END, ' ' ORDER BY f.sort_order,f.field_key
    ), '')
  ) FROM public.dataset_fields f
  WHERE f.dataset_id=p_dataset_id AND f.is_searchable
    AND f.data_type IN ('string','enum');
$$;
--> statement-breakpoint
CREATE FUNCTION public.datascope_sync_search_vector()
RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,public
AS $$
BEGIN
  -- Share the parent row with other record writers; metadata takes FOR UPDATE.
  PERFORM id FROM public.datasets WHERE id=NEW.dataset_id FOR KEY SHARE;
  NEW.search_vector=public.datascope_build_search_vector(
    NEW.dataset_id,NEW.name,NEW.status,NEW.country,NEW.category,NEW.attributes);
  IF TG_OP='UPDATE' THEN
    -- This trigger sorts after touch_updated_at. Derived-index maintenance must
    -- not pretend that a business record changed or invalidate seed timestamps.
    IF (to_jsonb(NEW)-'search_vector'-'updated_at') IS NOT DISTINCT FROM
       (to_jsonb(OLD)-'search_vector'-'updated_at') THEN
      NEW.updated_at=OLD.updated_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER zz_sync_search_vector
BEFORE INSERT OR UPDATE OF dataset_id,name,status,country,category,attributes,search_vector
ON public.dataset_records FOR EACH ROW
EXECUTE FUNCTION public.datascope_sync_search_vector();
--> statement-breakpoint
CREATE FUNCTION public.datascope_lock_search_metadata()
RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,public
AS $$
DECLARE previous_dataset uuid; next_dataset uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN previous_dataset=OLD.dataset_id; END IF;
  IF TG_OP<>'DELETE' THEN next_dataset=NEW.dataset_id; END IF;
  PERFORM id FROM public.datasets
    WHERE id=ANY(ARRAY[previous_dataset,next_dataset]) ORDER BY id FOR UPDATE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lock_search_metadata BEFORE INSERT OR UPDATE OR DELETE
ON public.dataset_fields FOR EACH ROW
EXECUTE FUNCTION public.datascope_lock_search_metadata();
--> statement-breakpoint
CREATE FUNCTION public.datascope_refresh_search_metadata()
RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,public
AS $$
DECLARE affected uuid[];
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT array_agg(DISTINCT dataset_id) INTO affected FROM new_fields
      WHERE is_searchable AND data_type IN ('string','enum');
  ELSIF TG_OP='DELETE' THEN
    SELECT array_agg(DISTINCT dataset_id) INTO affected FROM old_fields
      WHERE is_searchable AND data_type IN ('string','enum');
  ELSE
    SELECT array_agg(DISTINCT dataset_id) INTO affected FROM (
      SELECT o.dataset_id FROM old_fields o FULL JOIN new_fields n USING(id)
      WHERE o.is_searchable AND o.data_type IN ('string','enum')
        AND ROW(o.dataset_id,o.field_key,o.data_type,o.is_searchable,o.sort_order)
          IS DISTINCT FROM ROW(n.dataset_id,n.field_key,n.data_type,n.is_searchable,n.sort_order)
      UNION
      SELECT n.dataset_id FROM old_fields o FULL JOIN new_fields n USING(id)
      WHERE n.is_searchable AND n.data_type IN ('string','enum')
        AND ROW(o.dataset_id,o.field_key,o.data_type,o.is_searchable,o.sort_order)
          IS DISTINCT FROM ROW(n.dataset_id,n.field_key,n.data_type,n.is_searchable,n.sort_order)
    ) changed;
  END IF;
  -- One refresh per affected dataset/statement, rather than per metadata row.
  UPDATE public.dataset_records SET search_vector=search_vector
    WHERE dataset_id=ANY(affected);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER refresh_search_metadata_insert AFTER INSERT ON public.dataset_fields
REFERENCING NEW TABLE AS new_fields FOR EACH STATEMENT
EXECUTE FUNCTION public.datascope_refresh_search_metadata();
--> statement-breakpoint
CREATE TRIGGER refresh_search_metadata_update AFTER UPDATE ON public.dataset_fields
REFERENCING OLD TABLE AS old_fields NEW TABLE AS new_fields FOR EACH STATEMENT
EXECUTE FUNCTION public.datascope_refresh_search_metadata();
--> statement-breakpoint
CREATE TRIGGER refresh_search_metadata_delete AFTER DELETE ON public.dataset_fields
REFERENCING OLD TABLE AS old_fields FOR EACH STATEMENT
EXECUTE FUNCTION public.datascope_refresh_search_metadata();
--> statement-breakpoint
-- Trigger backfill also preserves existing business modification timestamps.
UPDATE public.dataset_records SET search_vector=search_vector;
--> statement-breakpoint
DROP INDEX "dataset_records_dataset_id_idx";--> statement-breakpoint
ALTER TABLE "dataset_records" ALTER COLUMN "search_vector" SET DEFAULT ''::tsvector;--> statement-breakpoint
ALTER TABLE "dataset_records" ALTER COLUMN "search_vector" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "dataset_records_dataset_id_id_idx" ON "dataset_records" USING btree ("dataset_id","id");--> statement-breakpoint
CREATE INDEX "dataset_records_dataset_created_id_idx" ON "dataset_records" USING btree ("dataset_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dataset_records_dataset_status_country_id_idx" ON "dataset_records" USING btree ("dataset_id","status","country","id");--> statement-breakpoint
CREATE INDEX "dataset_records_dataset_revenue_id_idx" ON "dataset_records" USING btree ("dataset_id","revenue","id");--> statement-breakpoint
CREATE INDEX "dataset_records_search_vector_gin_idx" ON "dataset_records" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "dataset_records_name_trgm_gin_idx" ON "dataset_records" USING gin (lower("name") public.gin_trgm_ops);
--> statement-breakpoint
ANALYZE public.dataset_records;
