-- Whose goal it is, as a department rather than as a person.
--
-- A goal belonged to a member and to nobody else, so "what is Cadet Programs trying to achieve this year" had
-- no answer and the Aerospace Education officer had no page of their own to look at. Worse, a goal owned by a
-- member left the squadron when the member did: the work was still the squadron's, but the only thing joining
-- it to the unit was somebody's name.
--
-- So a goal may now name a functional area as well. The owner is still a person - somebody has to be answerable
-- - but the area is what survives them, and it is how a duty position gets a page showing what it is for.
ALTER TABLE goals ADD COLUMN functional_area_key TEXT REFERENCES functional_areas(key);

CREATE INDEX IF NOT EXISTS goals_area ON goals(functional_area_key, status);
