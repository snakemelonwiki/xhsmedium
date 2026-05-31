ALTER TABLE posts
  ADD COLUMN cover_thumb_url VARCHAR(500) NULL COMMENT '封面缩略图URL' AFTER cover_image_url;
