import { TestBed } from '@angular/core/testing';
import { cardTilt } from '../core/index-card';
import { Ingredient } from '../core/model/recipes.model';
import { IndexCardComponent } from './index-card.component';

const ing = (name: string): Ingredient => ({ qty: 1, unit: '', name, aisle: 'pantry' });

describe('IndexCardComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(IndexCardComponent);
    fixture.componentRef.setInput('title', "Grandma's Chili");
    fixture.componentRef.setInput('ingredients', [ing('hamburger'), ing('kidney beans, drained')]);
    fixture.componentRef.setInput('seed', 'grandmas-chili');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('writes the title on the header line and the ingredients on the rules', () => {
    const el = render();
    expect(el.querySelector('.card-title')?.textContent?.trim()).toBe("Grandma's Chili");
    expect([...el.querySelectorAll('.card-lines li')].map((li) => li.textContent?.trim())).toEqual([
      'Hamburger',
      'Kidney beans',
    ]);
  });

  it("leans by the recipe's own amount", () => {
    const card = render().querySelector<HTMLElement>('.index-card')!;
    expect(card.style.getPropertyValue('--tilt')).toBe(`${cardTilt('grandmas-chili')}deg`);
  });

  it('stays out of the accessibility tree, since the page already says all of it', () => {
    render();
    const host = TestBed.createComponent(IndexCardComponent).nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
