# Dockerfile de la app (vive en backend/ del repo: el rsync --delete del CI borraría uno que no esté).
# Parte del stub del kit infra/vps, con dos diferencias a propósito:
#  - /var/storage NO se publica por HTTP: los archivos de usuario van a R2 y storage/ queda solo
#    para temporales y exportaciones (una cuenta de servicio de FCM quedó descargable así en 2026-09).
#  - _lib/ y cualquier archivo que empiece con _ no se sirven.
# Los logs de Apache de la imagen oficial ya van a stdout/stderr → `docker logs`.
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpng-dev libjpeg-dev libwebp-dev libfreetype6-dev libzip-dev curl unzip \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install mysqli gd zip opcache

RUN a2enmod rewrite headers

RUN { echo "opcache.enable=1"; \
      echo "opcache.memory_consumption=128"; \
      echo "opcache.max_accelerated_files=10000"; } > /usr/local/etc/php/conf.d/opcache-tuning.ini

RUN printf '%s\n' \
      '<VirtualHost *:80>' \
      '    DocumentRoot /var/www/html' \
      '    <Directory /var/www/html>' \
      '        Options -Indexes' \
      '        AllowOverride None' \
      '        Require all granted' \
      '    </Directory>' \
      '    <DirectoryMatch "^/var/www/html/(_lib|cron)">' \
      '        Require all denied' \
      '    </DirectoryMatch>' \
      '    <FilesMatch "^(_.*|Dockerfile|.*\.(sql|md|sh|ini|env))$">' \
      '        Require all denied' \
      '    </FilesMatch>' \
      '</VirtualHost>' > /etc/apache2/sites-enabled/000-default.conf

RUN mkdir -p /var/log/app && chown www-data:www-data /var/log/app

WORKDIR /var/www/html
EXPOSE 80
