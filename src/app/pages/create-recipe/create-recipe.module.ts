import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CreateRecipeRoutingModule } from './create-recipe-routing.module';
import { CreateRecipeComponent } from './create-recipe.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
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
