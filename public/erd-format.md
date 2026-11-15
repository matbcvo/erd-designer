# ERD Designer file format (`.erd.json`)

ERD Designer (https://matbcvo.github.io/erd-designer/) saves models as JSON. Open a file with **Open…** or by dropping it on the canvas.

- Full example using every feature: https://matbcvo.github.io/erd-designer/example.erd.json
- This document: https://matbcvo.github.io/erd-designer/erd-format.md

## Top level

```json
{ "version": 1, "name": "My model", "entities": [], "relationships": [], "notes": [] }
```

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `1` | Always 1. |
| `name` | string | Model name, used for export file names. |
| `entities` | Entity[] | Tables. Required (a file without it is rejected). |
| `relationships` | Relationship[] | Optional, default `[]`. |
| `notes` | Note[] | Free text on the diagram. Optional, default `[]`. |

Unknown keys are ignored. Any missing `id` is generated on load.

## Entity

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique. Convention: `e_<name>`. |
| `name` | string | Table name. Must be unique (case-insensitive). |
| `x`, `y` | number | Top-left corner on the canvas in px. Use multiples of 10. |
| `color` | string? | Header colour, any CSS colour. Omit for the default (light grey, prints best). Palette: `#2563eb` `#0f766e` `#7c3aed` `#c2410c` `#be123c` `#4d7c0f` `#475569`. |
| `comment` | string? | Exported as a table comment. |
| `attributes` | Attribute[] | Columns, in display order. |

## Attribute

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique within the model. Convention: `a_<entity>_<name>`. |
| `name` | string | Column name, unique within the entity. |
| `type` | string | SQL type (`INTEGER`, `VARCHAR(100)`, `DECIMAL(10,2)`, `DATE`, `TIMESTAMP`, `BOOLEAN`, `SERIAL`, …) or a plain word (`int`, `string`, `text`, `datetime`, `bool`, `money`). The SQL export maps it per database. |
| `pk` | boolean | Part of the primary key. Several `pk` columns make a composite key. |
| `nullable` | boolean | `true` = NULL allowed. Defaults to `true` if missing, so set `false` for mandatory columns and every PK column. |
| `unique` | boolean | UNIQUE constraint. |
| `defaultValue` | string? | SQL default, e.g. `CURRENT_TIMESTAMP`, `0`, `'new'`. |
| `comment` | string? | Column comment. |
| `fk` | object? | Only on foreign key columns: `{ "relationshipId": "<relationship id>", "refAttributeId": "<referenced PK attribute id>" }`. |

## Relationship

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique. Convention: `r_<verb>`. |
| `name` | string | Verb label shown on the line, e.g. `places`. May be empty. |
| `source`, `target` | End | The two ends (see below). The same entity at both ends makes a self-reference. |
| `identifying` | boolean | `true`: the FK becomes part of the child's primary key and the line is solid. `false`: dashed line. |
| `onDelete`, `onUpdate` | string | `NO ACTION`, `RESTRICT`, `CASCADE` or `SET NULL`. |

**End** = `{ "entityId": "<entity id>", "min": 0 | 1, "max": "one" | "many" }`.

`min`/`max` describe how many instances of **this end's** entity relate to one instance of the entity at the other end. That is the crow's foot symbol drawn next to this entity. For "each Customer places zero or many Orders", use:

```json
"source": { "entityId": "e_customer", "min": 1, "max": "one" },
"target": { "entityId": "e_order",    "min": 0, "max": "many" }
```

| `min`, `max` | Symbol |
| --- | --- |
| `1`, `"one"` | exactly one |
| `0`, `"one"` | zero or one |
| `1`, `"many"` | one or many |
| `0`, `"many"` | zero or many |

## Foreign keys are derived from relationships

On load, every FK column is recalculated from the relationships. You can leave FK columns out entirely and they are added. When you do write them, their `name` and position are kept, and `type`, `nullable` and `pk` are corrected.

- **Parent / child:** the `"one"` end is the parent and the `"many"` end holds the FK. In one-to-one, the optional (`min: 0`) end holds the FK if the other end is mandatory. Otherwise the target holds it.
- **Many-to-many** (`many`–`many`) produces no FK, and the app warns about it. Model it as a junction entity with two identifying one-to-many relationships instead (see `Enrollment` in the example).
- **One FK column per parent PK column**, with `fk.refAttributeId` pointing at that PK attribute.
- **`type`** is the parent PK's type, except `SERIAL` → `INTEGER`, `BIGSERIAL` → `BIGINT` and `SMALLSERIAL` → `SMALLINT`.
- **`nullable`** is `true` only when the parent end has `min: 0` and the relationship is not identifying.
- **`pk`** equals `identifying`. A self-reference is never part of the PK.
- **Default name:** `<parent>_id` when the PK is `id`, for example `customer_id`. Otherwise it is `<parent>_<pk>`, for example `course_code`. For a self-reference it is `<relationship name>_<pk>`.
- **New FK columns** go after the PK columns if identifying, else at the end.
- **Stale FK columns** whose relationship or referenced PK no longer exists are removed.

## Note

Free text placed on the diagram, such as a title, author or date. Included in PNG and SVG exports.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique. Convention: `n_<purpose>`. |
| `text` | string | Use `\n` for line breaks. Lines don't wrap. |
| `x`, `y` | number | Top-left corner in px. |
| `fontSize` | number? | px, default 13. The editor offers 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40 and 48. |
| `bold`, `italic`, `underline` | boolean? | Omit when false. |

## Layout tips

- An entity is about 190–260 px wide and about 30 + 21 × (number of attributes) px tall. Leave at least 100 px horizontally and 80 px vertically between entities for lines and labels.
- Parents usually go above or to the left of their children.

## Checks the app runs

These are **errors**:
- an entity or attribute without a name
- duplicate entity names
- duplicate attribute names within an entity

These are **warnings**:
- an entity without attributes or without a primary key
- an attribute without a type
- an unresolved many-to-many relationship
- a one-to-one relationship that is mandatory on both ends
- a self-reference that isn't "zero or one" to "zero or many"

A well-formed model, like the example, has none of these.
