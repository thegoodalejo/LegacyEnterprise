import { Injectable, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslationService } from '../../services/translation.service';

/** Textos del paginador en el idioma de la sesión (Material los trae en inglés). */
@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private i18n = inject(TranslationService);

  constructor() {
    super();
    this.itemsPerPageLabel = this.i18n.t('common.per_page');
    this.nextPageLabel = this.i18n.t('common.next_page');
    this.previousPageLabel = this.i18n.t('common.prev_page');
    this.firstPageLabel = this.i18n.t('common.first_page');
    this.lastPageLabel = this.i18n.t('common.last_page');
    this.getRangeLabel = (page, size, length) => {
      if (!length) return `0 / 0`;
      const start = page * size + 1;
      return `${start}–${Math.min(start + size - 1, length)} / ${length}`;
    };
  }
}
