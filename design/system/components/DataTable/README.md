# DataTable
The admin console's primary element: a filter bar with tab-chips and saved views, a dense table (36px rows, sticky header, sort, column chooser), row selection and a Clinical Glass bulk bar.

**Anatomy** filter chips with counts · search well · saved-view button · `dt-table` (header on `surface-sunken`, hairline rows, hover `surface-raised`, selected `brand-soft`) · bulk bar (`dt-glass`, appears on selection, states the privacy constraint of the action when relevant). Age/SLA cells use badges with icon + duration; status cells use `Badge`. Row click opens the right drawer (480px) rather than a page.

**Responsive** not rendered below 1024px (admin is desktop-only); at 1024–1439 non-essential columns collapse behind the column chooser.

**Consumer provides** columns, rows, selection state, filters, saved views, bulk actions with their permission grants. Don't: cards for records; color-only SLA cells; actions without a reason dialog when they change a user's status.
