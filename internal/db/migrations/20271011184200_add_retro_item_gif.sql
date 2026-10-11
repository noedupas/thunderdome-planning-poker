-- +goose Up
-- +goose StatementBegin

ALTER TABLE thunderdome.retro_item
ADD COLUMN gif JSONB;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE thunderdome.retro_item
DROP COLUMN gif;

-- +goose StatementEnd
