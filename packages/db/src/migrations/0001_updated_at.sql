CREATE FUNCTION public.datascope_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.datasets
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.dataset_fields
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.dataset_permissions
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.dataset_records
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.saved_views
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.datascope_touch_updated_at();
