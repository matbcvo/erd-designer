# ERD Designer

A browser-based entity–relationship diagram editor using crow's foot notation. Runs entirely in the browser; nothing is sent to a server.

**Live app:** https://matbcvo.github.io/erd-designer/

## Features

- Entities with attributes: name, data type, primary key, NOT NULL, unique, default value, comment
- Relationships in crow's foot notation: exactly one, zero or one, one or many, zero or many
- Identifying (solid line) and non-identifying (dashed line) relationships
- Foreign key columns are added and kept in sync automatically on the "many" side; identifying relationships make them part of the primary key
- Self-referencing relationships (e.g. employee → manager)
- Right-angle relationship lines with softly rounded bends; lines route around other entities and keep apart from each other
- One click to convert a many-to-many relationship into a junction table
- Plain-language reading of each relationship ("Each Customer places zero or many Order")
- Model checks: missing primary keys, duplicate names, unresolved many-to-many relationships, recursive relationships that aren't "zero or one – zero or many"
- Undo / redo, autosave in the browser, light and dark theme
- English and Estonian interface

### Import and export

- **Save / Open** the model as a `.erd.json` file (also drag and drop a file onto the canvas)
- **SQL DDL** for PostgreSQL, MySQL/MariaDB, SQLite and SQL Server
- **PNG** and **SVG** images of the whole diagram

Data types can be written as SQL types (`VARCHAR(100)`, `DECIMAL(10,2)`, `TIMESTAMP`) or as plain words such as `int`, `string`, `datetime`, `bool`, `money`; the SQL export maps them to the chosen database.

## Usage

| Action | How |
| --- | --- |
| Add entity | **+ Entity** button, or double-click the canvas |
| Add relationship | Hover an entity, drag any of the blue dots on its sides onto another entity (or itself) |
| Edit | Click an entity or relationship line; edit in the right panel |
| Delete | Select and press Delete / Backspace |
| Multi-select | Shift-drag a box, or Ctrl/Cmd-click |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) |
| Save model file | Ctrl+S |

## Development

```sh
npm install
npm run dev      # dev server
npm test         # unit tests (model, foreign keys, SQL)
npm run build    # production build into dist/
```

Built with React, TypeScript, Vite and [React Flow](https://reactflow.dev/). Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`. The build uses relative paths, so `dist/` can be hosted anywhere static (Cloudflare Pages, Netlify, a plain web server).

### Project layout

```
src/model/       model types, foreign key sync, SQL generation, validation, file I/O (framework-free, unit tested)
src/components/  entity node, crow's foot edge, inspector panel, SQL dialog
src/App.tsx      canvas, toolbar, selection and shortcuts
src/store.ts     model state with undo/redo and autosave
```
