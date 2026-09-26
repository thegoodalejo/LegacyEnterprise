import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTab, MatTabContent, MatTabGroup } from '@angular/material/tabs';
import { TranslatePipe } from '../../services/translation.service';
import { CrmCamposTabComponent } from './crm-campos-tab.component';
import { CrmCatalogoTabComponent } from './crm-catalogo-tab.component';
import { CrmEmbudoTabComponent } from './crm-embudo-tab.component';
import { CrmMetricasTabComponent } from './crm-metricas-tab.component';
import { CrmRolesTabComponent } from './crm-roles-tab.component';
import { CrmTagsTabComponent } from './crm-tags-tab.component';
import { CrmTemplatesTabComponent } from './crm-templates-tab.component';
import { CrmVocabTabComponent } from './crm-vocab-tab.component';

/**
 * Configuración del CRM por empresa (L4+): campos personalizados, etiquetas, embudo, catálogo, métricas de metas, roles, vocabulario y plantillas.
 * Campos, etiquetas, roles y vocabulario son compartidos con Comunicaciones (sus Ajustes muestran las mismas pestañas).
 */
@Component({
  selector: 'app-crm-config-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTab, MatTabContent, MatTabGroup, CrmCamposTabComponent, CrmTagsTabComponent, CrmRolesTabComponent, CrmTemplatesTabComponent, CrmVocabTabComponent,
    CrmEmbudoTabComponent, CrmCatalogoTabComponent, CrmMetricasTabComponent, TranslatePipe],
  template: `
    <div class="page">
      <header class="page-header"><h1>{{ 'crm.config.title' | translate }}</h1></header>
      <!-- Con matTabContent cada pestaña se crea al abrirla: siempre muestra lo último (p. ej. tras aplicar una plantilla). -->
      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab [label]="'crm.config.fields' | translate"><ng-template matTabContent><app-crm-campos-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.tags' | translate"><ng-template matTabContent><app-crm-tags-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.funnel' | translate"><ng-template matTabContent><app-crm-embudo-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.catalog' | translate"><ng-template matTabContent><app-crm-catalogo-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.metrics' | translate"><ng-template matTabContent><app-crm-metricas-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.roles' | translate"><ng-template matTabContent><app-crm-roles-tab /></ng-template></mat-tab>
        <mat-tab [label]="'crm.config.vocab' | translate"><app-crm-vocab-tab /></mat-tab>
        <mat-tab [label]="'crm.config.templates' | translate"><app-crm-templates-tab /></mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export default class CrmConfigPage {}
