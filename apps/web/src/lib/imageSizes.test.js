import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_LIMITS,
  computeLongEdgeSize,
  selectEncodeFormat,
  formatFromOutputType,
  gridImageProps,
  extensionFromUrl,
} from './imageSizes.js';

test('portrait long edge: 3024x4032 fits inside 2560 on the long side', () => {
  const sized = computeLongEdgeSize(3024, 4032, IMAGE_LIMITS.original);
  assert.equal(sized.height, 2560);
  assert.equal(sized.width, 1920);
  assert.ok(sized.height > sized.width);
  assert.equal(Math.max(sized.width, sized.height), 2560);
});

test('landscape long edge: 4032x3024 fits inside 2560 on the long side', () => {
  const sized = computeLongEdgeSize(4032, 3024, IMAGE_LIMITS.original);
  assert.equal(sized.width, 2560);
  assert.equal(sized.height, 1920);
  assert.ok(sized.width > sized.height);
  assert.equal(Math.max(sized.width, sized.height), 2560);
});

test('square long edge: 3000x3000 becomes 2560x2560', () => {
  assert.deepEqual(computeLongEdgeSize(3000, 3000, IMAGE_LIMITS.original), {
    width: 2560,
    height: 2560,
  });
});

test('square already within the limit is not upscaled', () => {
  assert.deepEqual(computeLongEdgeSize(400, 400, IMAGE_LIMITS.thumbnail), {
    width: 400,
    height: 400,
  });
});

test('smaller than the limit keeps the source pixels', () => {
  assert.deepEqual(computeLongEdgeSize(1920, 1080, IMAGE_LIMITS.original), {
    width: 1920,
    height: 1080,
  });
});

test('web and thumbnail caps use the same long-edge rule', () => {
  const web = computeLongEdgeSize(3024, 4032, IMAGE_LIMITS.web);
  const thumb = computeLongEdgeSize(4032, 3024, IMAGE_LIMITS.thumbnail);
  assert.equal(Math.max(web.width, web.height), 1600);
  assert.equal(web.height, 1600);
  assert.equal(Math.max(thumb.width, thumb.height), 400);
  assert.equal(thumb.width, 400);
});

test('odd portrait ratio rounds the short side and keeps the long side exact', () => {
  const sized = computeLongEdgeSize(1000, 3001, 1600);
  assert.equal(sized.height, 1600);
  assert.equal(sized.width, Math.round((1000 * 1600) / 3001));
  assert.ok(sized.width >= 1);
});

test('WebP is selected only when encoding support was detected', () => {
  assert.deepEqual(selectEncodeFormat(true), {
    contentType: 'image/webp',
    extension: 'webp',
    quality: 0.85,
  });
  assert.deepEqual(selectEncodeFormat(false), {
    contentType: 'image/jpeg',
    extension: 'jpg',
    quality: 0.85,
  });
});

test('contentType and extension follow the real encoder output', () => {
  assert.deepEqual(formatFromOutputType('image/webp'), {
    contentType: 'image/webp',
    extension: 'webp',
  });
  assert.deepEqual(formatFromOutputType('image/jpeg'), {
    contentType: 'image/jpeg',
    extension: 'jpg',
  });
  assert.deepEqual(formatFromOutputType('image/jpg'), {
    contentType: 'image/jpeg',
    extension: 'jpg',
  });
  // Safari OffscreenCanvas asked for WebP and returned PNG. Do not name it .webp or .jpg.
  assert.deepEqual(formatFromOutputType('image/png'), {
    contentType: 'image/png',
    extension: 'png',
  });
  assert.deepEqual(formatFromOutputType(''), {
    contentType: 'image/jpeg',
    extension: 'jpg',
  });
  assert.deepEqual(formatFromOutputType('image/webp;charset=utf-8'), {
    contentType: 'image/webp',
    extension: 'webp',
  });
});

test('download extension is taken from the stored object, not forced to jpg', () => {
  assert.equal(
    extensionFromUrl('https://cdn.example/storage/v1/object/public/project-media/p/1_web.webp?t=1'),
    'webp'
  );
  assert.equal(
    extensionFromUrl('https://cdn.example/storage/v1/object/public/project-media/p/1.JPEG'),
    'jpg'
  );
  assert.equal(extensionFromUrl('https://cdn.example/no-ext', 'mp4'), 'mp4');
});

test('grid srcset offers thumb and web and leaves the original out', () => {
  const props = gridImageProps({
    thumbnail_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a_thumb.webp',
    web_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a_web.webp',
    file_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a.webp',
  });
  assert.equal(props.src, 'https://cdn.example/storage/v1/object/public/project-media/p/a_thumb.webp');
  assert.equal(
    props.srcSet,
    [
      'https://cdn.example/storage/v1/object/public/project-media/p/a_thumb.webp 400w',
      'https://cdn.example/storage/v1/object/public/project-media/p/a_web.webp 1600w',
    ].join(', ')
  );
  assert.equal(props.srcSet.includes('/a.webp '), false);
  assert.equal(props.srcSet.endsWith('/a.webp 1600w'), false);
});

test('annotated photos display the flattened jpeg instead of the clean thumbnail', () => {
  const props = gridImageProps({
    thumbnail_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a_thumb.webp',
    web_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a_web.webp',
    file_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a.webp',
    annotated_url: 'https://cdn.example/storage/v1/object/public/project-media/p/a_note_web.jpg',
  });
  assert.equal(props.src, 'https://cdn.example/storage/v1/object/public/project-media/p/a_note_web.jpg');
  assert.equal(props.srcSet, undefined);
});

test('legacy rows whose thumbnail is the original do not pretend to have a 400w file', () => {
  const full = 'https://cdn.example/storage/v1/object/public/project-media/p/legacy.jpg';
  const props = gridImageProps({ thumbnail_url: full, file_url: full, web_url: null });
  assert.equal(props.src, full);
  assert.equal(props.srcSet, undefined);
});
