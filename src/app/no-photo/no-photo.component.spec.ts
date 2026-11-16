import { TestBed } from '@angular/core/testing';
import { NoPhotoComponent } from './no-photo.component';

describe('NoPhotoComponent', () => {
  it('draws the open cookbook, out of the accessibility tree', () => {
    const fixture = TestBed.createComponent(NoPhotoComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('99 155 462 316');
    // Coloured by the stylesheet, so it follows the design tokens.
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });
});
