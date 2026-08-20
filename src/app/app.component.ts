import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
    searchTerm: string = '';
    title = 'recipes';
    constructor(private router: Router) {}

    ngOnInit() {
        const colorThemes = ['red-theme', 'blue-theme', 'green-theme', 'sea-green-theme', 'yellow-theme', 'orange-theme', 'purple-theme', 'pink-theme', 'brown-theme'];
        const randomColor = colorThemes[Math.floor(Math.random() * colorThemes.length)];
        document.body.classList.add(randomColor);
    }

    searchRecipes() {
        this.router.navigate(['/search'], { queryParams: { q: this.searchTerm } });
    }
}
