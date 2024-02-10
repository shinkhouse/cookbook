import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RecipesRoutingModule } from './recipes-routing.module';
import { RecipesComponent } from './recipes.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatLegacyListModule as MatListModule } from '@angular/material/legacy-list';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyTooltipModule as MatTooltipModule } from '@angular/material/legacy-tooltip';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatLegacyCardModule as MatCardModule } from '@angular/material/legacy-card';
@NgModule({
    declarations: [RecipesComponent],
    imports: [
        CommonModule,
        RecipesRoutingModule,
        MatSidenavModule,
        MatListModule,
        MatTooltipModule,
        MatToolbarModule,
        FormsModule,
        ReactiveFormsModule,
        MatIconModule,
        FlexLayoutModule,
        MatButtonModule,
        MatGridListModule,
        MatCardModule
    ],
})
export class RecipesModule {}
