# logs/

Todos los archivos de log del sistema viven aquí. Antes estaban regados: unos
en la raíz, otros en `acciones/` y `lib/` (por usar `__DIR__` dentro de un
subdirectorio), y otros en `webhooks/`. Los de los subdirectorios no los miraba
nadie, porque nadie sabía que existían.

La carpeta se versiona con este archivo y con `.htaccess` a propósito: si no
existiera en el servidor, `file_put_contents()` fallaría en silencio y se
perderían los logs sin que nadie se enterara.

No se sirven por web (ver `.htaccess`).
