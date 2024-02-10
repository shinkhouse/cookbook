import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CreateRecipeRoutingModule } from './create-recipe-routing.module';
import { CreateRecipeComponent } from './create-recipe.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatLegacyButtonModule as MatButtonModule } from '@angular/material/legacy-button';
import { MatLegacyInputModule as MatInputModule } from '@angular/material/legacy-input';
import { MatLegacyFormFieldModule as MatFormFieldModule } from '@angular/material/legacy-form-field';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FlexLayoutModule } from '@angular/flex-layout';
import { ClipboardModule } from '@angular/cdk/clipboard';
@NgModule({
    declarations: [CreateRecipeComponent],
    imports: [
        CommonModule,
        CreateRecipeRoutingModule,
        FormsModule,
        ReactiveFormsModule,
        MatIconModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        MatToolbarModule,
        FlexLayoutModule,
        ClipboardModule
    ],
})
export class CreateRecipeModule {}
