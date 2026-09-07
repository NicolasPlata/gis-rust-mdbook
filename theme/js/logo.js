(function () {
    // The visible chapter list lives inside <mdbook-sidebar-scrollbox>, a
    // custom element that overwrites its own innerHTML on connect and is
    // positioned absolute+inset:0 over the whole <nav>. Inserting the logo
    // as a sibling of the scrollbox gets visually covered by it, so the
    // logo has to go INSIDE the scrollbox, as its first child.
    var scrollbox = document.querySelector('#mdbook-sidebar mdbook-sidebar-scrollbox');
    if (!scrollbox || scrollbox.querySelector('.sidebar-logo-link')) {
        return;
    }

    var link = document.createElement('a');
    link.href = path_to_root + 'index.html';
    link.className = 'sidebar-logo-link';
    link.setAttribute('aria-label', 'APIs GIS con Rust -- inicio');

    var img = document.createElement('img');
    img.src = path_to_root + 'images/logo.png';
    img.alt = 'Logo de APIs GIS con Rust';
    img.className = 'sidebar-logo';

    link.appendChild(img);
    scrollbox.insertBefore(link, scrollbox.firstChild);
})();
