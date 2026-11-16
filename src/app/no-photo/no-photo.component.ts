import { Component } from '@angular/core';

/**
 * Stands in for a missing recipe photo: an open cookbook, its recipe on one
 * page and a knife and fork on the other. Decorative, since the page around it
 * already names the recipe, so it stays out of the accessibility tree.
 *
 * Inline rather than an image file so it takes its colour from the stylesheet.
 */
@Component({
  selector: 'app-no-photo',
  templateUrl: './no-photo.component.html',
  styleUrl: './no-photo.component.scss',
  host: { 'aria-hidden': 'true' },
})
export class NoPhotoComponent {}
