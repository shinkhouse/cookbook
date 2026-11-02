import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceStore } from '../core/stores/device.store';
import { RecipeStore } from '../core/stores/recipe.store';

type Message = '' | 'wrong' | 'locked-out' | 'unreachable';

/**
 * The footer's way to let a phone or tablet save on the read-only live site.
 * Absent in a writable build, which can already save.
 */
@Component({
  selector: 'app-device-unlock',
  imports: [FormsModule],
  templateUrl: './device-unlock.component.html',
  styleUrl: './device-unlock.component.scss',
})
export class DeviceUnlockComponent {
  private readonly device = inject(DeviceStore);
  protected readonly show = !inject(RecipeStore).writable;
  protected readonly unlocked = this.device.unlocked;

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal<Message>('');
  protected passcode = '';

  protected readonly message = computed(() => {
    switch (this.problem()) {
      case 'wrong':
        return "That passcode didn't work.";
      case 'locked-out':
        return `Too many tries. Wait ${this.device.lockoutMinutes()} minutes and try again.`;
      case 'unreachable':
        return "Couldn't reach the recipe server.";
      default:
        return '';
    }
  });

  protected begin(): void {
    this.open.set(true);
  }

  protected cancel(): void {
    this.passcode = '';
    this.problem.set('');
    this.open.set(false);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const result = await this.device.unlock(this.passcode);
    this.busy.set(false);
    if (result === 'ok') {
      this.cancel();
    } else {
      this.passcode = '';
      this.problem.set(result);
    }
  }

  protected lock(): void {
    this.device.lock();
  }
}
