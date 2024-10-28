DROP TABLE groups;
CREATE TABLE groups (
    id integer,
    parent_id integer, -- ignore
    list_order integer, -- ignore
    inventory_id integer, -- ignore
    created timestamp,
    modified timestamp,
    index_modified timestamp, -- ignore
    active integer, -- 0/1
    title VARCHAR,
    descr text,
    image VARCHAR,
    files VARCHAR,
    extra text,
    se_page_title VARCHAR, -- ignore
    se_description text, -- ignore
    se_keywords VARCHAR, -- ignore
    intl_restriction VARCHAR -- ignore
);
-- \COPY companies FROM '/Users/rakib/Documents/Office/DevDec/TRL/trl_data/csv/groups_biz.csv' DELIMITER E'\t' CSV HEADER;