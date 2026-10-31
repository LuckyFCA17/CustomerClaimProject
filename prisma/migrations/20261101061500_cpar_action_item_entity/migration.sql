-- Evidence per baris kini dipakai dua section, bukan hanya permanent countermeasure:
-- standardization & horizontal deployment memakai bentuk isian yang sama. Nama entity
-- type-nya ikut menjadi netral.
--
-- Tanpa pembaruan ini, evidence yang sudah terlampir pada perbaikan tetap akan hilang
-- dari layar: barisnya masih ada, tetapi pemanggilan berkasnya mencari nama yang baru.
UPDATE "Attachment"
SET "entityType" = 'CparActionItem'
WHERE "entityType" = 'CparCountermeasure';
