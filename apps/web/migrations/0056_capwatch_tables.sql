-- What the download actually contained.
--
-- "Is the van in CAPWATCH?" is a question that has now come up more than once, and answering it from memory is
-- how somebody ends up building a page against a table that was never in the extract. The sync already knows -
-- it reads every file in the archive - so it may as well write down what it saw.
ALTER TABLE capwatch_syncs ADD COLUMN table_names TEXT;
