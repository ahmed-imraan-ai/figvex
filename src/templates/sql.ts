import type { Template } from "./index";

export const sqlTemplates: Template[] = [
  {
    id: "sql-shop",
    engine: "sql",
    category: "Data & databases",
    title: "Online shop (PostgreSQL)",
    summary: "Customers, orders, products and order lines. Paste your own CREATE TABLE statements to draw them.",
    code: `-- title: Online shop
-- Paste CREATE TABLE statements and the diagram follows.
-- Foreign keys become links. A circle means "zero", a bar "one"
-- and the crow's foot "many".

CREATE TABLE customers (
  id          serial PRIMARY KEY,
  email       varchar(255) NOT NULL UNIQUE,
  name        varchar(120) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id           serial PRIMARY KEY,
  customer_id  int NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  line1        text NOT NULL,
  city         text NOT NULL,
  postcode     varchar(12)
);

CREATE TABLE products (
  id     serial PRIMARY KEY,
  sku    varchar(32) NOT NULL UNIQUE,
  name   text NOT NULL,
  price  numeric(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE orders (
  id                   serial PRIMARY KEY,
  customer_id          int NOT NULL REFERENCES customers (id),
  delivery_address_id  int REFERENCES addresses (id),
  placed_at            timestamptz NOT NULL DEFAULT now(),
  status               varchar(20) NOT NULL DEFAULT 'new'
);

CREATE TABLE order_lines (
  order_id    int NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  int NOT NULL REFERENCES products (id),
  quantity    int NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
`,
  },
  {
    id: "sql-university",
    engine: "sql",
    category: "Data & databases",
    title: "University enrolment",
    summary: "Students, courses, modules and enrolments, with a one-to-one student record.",
    code: `-- title: University enrolment

CREATE TABLE departments (
  dept_code  char(4) PRIMARY KEY,
  name       varchar(80) NOT NULL
);

CREATE TABLE lecturers (
  staff_id   int PRIMARY KEY,
  name       varchar(80) NOT NULL,
  dept_code  char(4) NOT NULL REFERENCES departments (dept_code)
);

CREATE TABLE courses (
  course_code  varchar(10) PRIMARY KEY,
  title        varchar(120) NOT NULL,
  dept_code    char(4) NOT NULL REFERENCES departments (dept_code)
);

CREATE TABLE modules (
  module_code  varchar(10) PRIMARY KEY,
  title        varchar(120) NOT NULL,
  credits      smallint NOT NULL,
  leader_id    int REFERENCES lecturers (staff_id)
);

-- Which modules make up each course: many to many.
CREATE TABLE course_modules (
  course_code  varchar(10) REFERENCES courses (course_code),
  module_code  varchar(10) REFERENCES modules (module_code),
  compulsory   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (course_code, module_code)
);

CREATE TABLE students (
  student_id   int PRIMARY KEY,
  name         varchar(80) NOT NULL,
  course_code  varchar(10) NOT NULL REFERENCES courses (course_code)
);

-- One record per student: the key is also the foreign key.
CREATE TABLE student_records (
  student_id  int PRIMARY KEY REFERENCES students (student_id),
  date_of_birth date,
  personal_tutor int REFERENCES lecturers (staff_id)
);

CREATE TABLE enrolments (
  student_id   int REFERENCES students (student_id),
  module_code  varchar(10) REFERENCES modules (module_code),
  year         smallint,
  mark         smallint CHECK (mark BETWEEN 0 AND 100),
  PRIMARY KEY (student_id, module_code, year)
);
`,
  },
  {
    id: "sql-blog-mysql",
    engine: "sql",
    category: "Data & databases",
    title: "Blog (MySQL)",
    summary: "MySQL syntax with backticks, AUTO_INCREMENT and keys declared at the end of each table.",
    code: `-- title: Blog
-- MySQL style: backticks, AUTO_INCREMENT and named keys.

CREATE TABLE \`users\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`username\` varchar(40) NOT NULL,
  \`email\` varchar(255) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_users_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE \`posts\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`author_id\` int unsigned NOT NULL,
  \`title\` varchar(200) NOT NULL,
  \`body\` mediumtext NOT NULL,
  \`published_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_posts_author\` (\`author_id\`),
  CONSTRAINT \`fk_posts_author\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`id\`)
) ENGINE=InnoDB;

CREATE TABLE \`comments\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`post_id\` int unsigned NOT NULL,
  \`user_id\` int unsigned DEFAULT NULL,
  \`parent_id\` int unsigned DEFAULT NULL COMMENT 'Reply to another comment',
  \`body\` text NOT NULL,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`fk_comments_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_comments_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`fk_comments_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`comments\` (\`id\`)
) ENGINE=InnoDB;

CREATE TABLE \`tags\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(40) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_tags_name\` (\`name\`)
);

CREATE TABLE \`post_tags\` (
  \`post_id\` int unsigned NOT NULL,
  \`tag_id\` int unsigned NOT NULL,
  PRIMARY KEY (\`post_id\`, \`tag_id\`),
  CONSTRAINT \`fk_pt_post\` FOREIGN KEY (\`post_id\`) REFERENCES \`posts\` (\`id\`),
  CONSTRAINT \`fk_pt_tag\` FOREIGN KEY (\`tag_id\`) REFERENCES \`tags\` (\`id\`)
);
`,
  },
  {
    id: "sql-library-sqlite",
    engine: "sql",
    category: "Data & databases",
    title: "Library loans (SQLite)",
    summary: "SQLite tables with INTEGER PRIMARY KEY and table-level foreign keys.",
    code: `-- title: Library loans

CREATE TABLE members (
  member_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  joined TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE authors (
  author_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE books (
  isbn TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  published INTEGER,
  FOREIGN KEY (author_id) REFERENCES authors (author_id)
);

CREATE TABLE copies (
  copy_id INTEGER PRIMARY KEY,
  isbn TEXT NOT NULL,
  shelf TEXT,
  FOREIGN KEY (isbn) REFERENCES books (isbn)
);

CREATE TABLE loans (
  loan_id INTEGER PRIMARY KEY,
  copy_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  borrowed TEXT NOT NULL,
  due TEXT NOT NULL,
  returned TEXT,
  FOREIGN KEY (copy_id) REFERENCES copies (copy_id),
  FOREIGN KEY (member_id) REFERENCES members (member_id)
);
`,
  },
  {
    id: "sql-saas-groups",
    engine: "sql",
    category: "Data & databases",
    title: "Grouped schema (SQL Server)",
    summary: "A larger SaaS schema in boxes by area, with keys added afterwards by ALTER TABLE.",
    code: `-- title: Subscriptions
-- "-- group: Name" puts the tables after it in a box.
-- Try "Keys only" in the Style menu for a compact view.

-- group: Accounts
CREATE TABLE [dbo].[Organisations] (
  [Id] int IDENTITY(1,1) NOT NULL,
  [Name] nvarchar(200) NOT NULL,
  [Country] char(2) NULL,
  [CreatedAt] datetime2 NOT NULL,
  CONSTRAINT [PK_Organisations] PRIMARY KEY CLUSTERED ([Id])
);
GO
CREATE TABLE [dbo].[Users] (
  [Id] int IDENTITY(1,1) NOT NULL,
  [OrganisationId] int NOT NULL,
  [Email] nvarchar(255) NOT NULL,
  [DisplayName] nvarchar(100) NULL,
  [LastLogin] datetime2 NULL,
  CONSTRAINT [PK_Users] PRIMARY KEY ([Id]),
  CONSTRAINT [UQ_Users_Email] UNIQUE ([Email])
);
GO

-- group: Billing
CREATE TABLE [dbo].[Plans] (
  [Id] int NOT NULL PRIMARY KEY,
  [Name] nvarchar(50) NOT NULL,
  [MonthlyPrice] decimal(10,2) NOT NULL,
  [Seats] int NOT NULL
);
CREATE TABLE [dbo].[Subscriptions] (
  [Id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [OrganisationId] int NOT NULL,
  [PlanId] int NOT NULL,
  [StartsOn] date NOT NULL,
  [EndsOn] date NULL,
  [Status] varchar(20) NOT NULL
);
CREATE TABLE [dbo].[Invoices] (
  [Id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [SubscriptionId] int NOT NULL,
  [IssuedOn] date NOT NULL,
  [Total] decimal(10,2) NOT NULL,
  [PaidOn] date NULL
);
CREATE TABLE [dbo].[Payments] (
  [Id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [InvoiceId] int NOT NULL,
  [Amount] decimal(10,2) NOT NULL,
  [Method] varchar(20) NOT NULL,
  [Reference] nvarchar(100) NULL
);

-- group: Support
CREATE TABLE [dbo].[Tickets] (
  [Id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [OrganisationId] int NOT NULL,
  [OpenedById] int NOT NULL,
  [AssignedToId] int NULL,
  [Subject] nvarchar(200) NOT NULL,
  [Priority] tinyint NOT NULL
);
GO

ALTER TABLE [dbo].[Users] ADD CONSTRAINT [FK_Users_Organisations]
  FOREIGN KEY ([OrganisationId]) REFERENCES [dbo].[Organisations] ([Id]);
ALTER TABLE [dbo].[Subscriptions] ADD
  CONSTRAINT [FK_Subscriptions_Organisations] FOREIGN KEY ([OrganisationId]) REFERENCES [dbo].[Organisations] ([Id]),
  CONSTRAINT [FK_Subscriptions_Plans] FOREIGN KEY ([PlanId]) REFERENCES [dbo].[Plans] ([Id]);
ALTER TABLE [dbo].[Invoices] ADD CONSTRAINT [FK_Invoices_Subscriptions]
  FOREIGN KEY ([SubscriptionId]) REFERENCES [dbo].[Subscriptions] ([Id]);
ALTER TABLE [dbo].[Payments] ADD CONSTRAINT [FK_Payments_Invoices]
  FOREIGN KEY ([InvoiceId]) REFERENCES [dbo].[Invoices] ([Id]);
ALTER TABLE [dbo].[Tickets] ADD
  CONSTRAINT [FK_Tickets_Organisations] FOREIGN KEY ([OrganisationId]) REFERENCES [dbo].[Organisations] ([Id]),
  CONSTRAINT [FK_Tickets_OpenedBy] FOREIGN KEY ([OpenedById]) REFERENCES [dbo].[Users] ([Id]),
  CONSTRAINT [FK_Tickets_AssignedTo] FOREIGN KEY ([AssignedToId]) REFERENCES [dbo].[Users] ([Id]);
GO
`,
  },
  {
    id: "sql-focus",
    engine: "sql",
    category: "Data & databases",
    title: "Focus on part of a schema",
    summary: "\"-- focus: orders\" draws one table and the tables it links to, leaving the rest out.",
    code: `-- title: Around orders
-- Only orders and the tables it links to are drawn.
-- Remove the focus line to see every table.
-- focus: orders

CREATE TABLE regions (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE warehouses (id int PRIMARY KEY, region_id int NOT NULL REFERENCES regions (id), name text);
CREATE TABLE customers (id int PRIMARY KEY, region_id int REFERENCES regions (id), name text NOT NULL);
CREATE TABLE products (id int PRIMARY KEY, name text NOT NULL, price numeric(10, 2));
CREATE TABLE stock (
  warehouse_id int REFERENCES warehouses (id),
  product_id int REFERENCES products (id),
  quantity int NOT NULL,
  PRIMARY KEY (warehouse_id, product_id)
);
CREATE TABLE orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers (id),
  warehouse_id int REFERENCES warehouses (id),
  placed_at timestamp NOT NULL
);
CREATE TABLE order_lines (
  order_id int REFERENCES orders (id),
  product_id int REFERENCES products (id),
  quantity int NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE shipments (id int PRIMARY KEY, order_id int NOT NULL UNIQUE REFERENCES orders (id), shipped_at timestamp);
CREATE TABLE returns (id int PRIMARY KEY, shipment_id int NOT NULL REFERENCES shipments (id), reason text);
`,
  },
];
