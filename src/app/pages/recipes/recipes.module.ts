import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RecipesRoutingModule } from './recipes-routing.module';
import { RecipesComponent } from './recipes.component';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
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
        MatButtonModule
    ],
})
export class RecipesModule {}
