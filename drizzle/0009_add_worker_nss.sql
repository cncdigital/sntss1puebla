-- Campo sensible agregado al esquema. Los valores se cargan mediante el importador temporal protegido;
-- no se guardan CURP ni NSS del padrón dentro del repositorio.
ALTER TABLE workers ADD COLUMN nss TEXT;
