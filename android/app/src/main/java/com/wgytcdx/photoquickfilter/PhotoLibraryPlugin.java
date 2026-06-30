package com.wgytcdx.photoquickfilter;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "PhotoLibrary")
public class PhotoLibraryPlugin extends Plugin {
    private static final Set<String> PHOTO_EXTENSIONS = new HashSet<>(Arrays.asList(
        "jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"
    ));

    private static final Set<String> EXCLUDED_DIRS = new HashSet<>(Arrays.asList(
        "_delete_review", "_keep", "_stash", "_favorite"
    ));

    @PluginMethod
    public void selectSource(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "handleSelectSource");
    }

    @ActivityCallback
    private void handleSelectSource(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("未选择照片目录");
            return;
        }

        Uri treeUri = result.getData().getData();
        int flags = result.getData().getFlags() & (
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        );

        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            call.reject("无法保存目录访问权限", e);
            return;
        }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.isDirectory() || !root.canRead() || !root.canWrite()) {
            call.reject("所选目录不可读写，请选择 DCIM/Camera 或可写照片目录");
            return;
        }

        JSArray photos = new JSArray();
        scanDirectory(root, "", photos);

        JSObject response = new JSObject();
        response.put("sourceId", treeUri.toString());
        response.put("folderName", root.getName() == null ? "Android Photos" : root.getName());
        response.put("photos", photos);
        call.resolve(response);
    }

    @PluginMethod
    public void readPhotoDataUrl(PluginCall call) {
        String uriString = call.getString("uri");
        Integer maxSizeValue = call.getInt("maxSize", 1600);
        int maxSize = Math.max(256, maxSizeValue == null ? 1600 : maxSizeValue);
        if (uriString == null) {
            call.reject("缺少照片 URI");
            return;
        }

        try {
            Bitmap bitmap = decodeScaledBitmap(Uri.parse(uriString), maxSize);
            if (bitmap == null) {
                call.reject("无法解码照片");
                return;
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 84, out);
            bitmap.recycle();

            String base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            JSObject response = new JSObject();
            response.put("dataUrl", "data:image/jpeg;base64," + base64);
            call.resolve(response);
        } catch (Exception e) {
            call.reject("读取照片失败", e);
        }
    }

    @PluginMethod
    public void movePhoto(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String relativePath = call.getString("relativePath");
        String name = call.getString("name");
        String category = call.getString("category");
        if (sourceId == null || relativePath == null || name == null || category == null) {
            call.reject("移动照片参数不完整");
            return;
        }

        try {
            DocumentFile root = requireRoot(sourceId);
            DocumentFile source = findByRelativePath(root, relativePath);
            if (source == null || !source.isFile()) {
                call.reject("无法读取原照片，文件可能已被移动或删除");
                return;
            }

            DocumentFile categoryDir = ensureDirectory(root, categoryDirName(category));
            DocumentFile targetDir = ensureSubDirs(categoryDir, directoryPart(relativePath));
            String targetName = findUniqueName(targetDir, name);
            DocumentFile target = targetDir.createFile(resolveMimeType(source), targetName);
            if (target == null) {
                call.reject("无法创建目标文件");
                return;
            }

            copyDocument(source, target);
            if (!source.delete()) {
                target.delete();
                call.reject("原照片删除失败，已回滚目标文件");
                return;
            }

            notifyChanged(root.getUri());
            notifyChanged(target.getUri());

            JSObject response = new JSObject();
            response.put("targetUri", target.getUri().toString());
            response.put("targetName", safeName(target, targetName));
            response.put("targetRelativePath", joinRelative(directoryPart(relativePath), safeName(target, targetName)));
            call.resolve(response);
        } catch (Exception e) {
            call.reject("移动照片失败", e);
        }
    }

    @PluginMethod
    public void undoMove(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String category = call.getString("category");
        String originalRelativePath = call.getString("originalRelativePath");
        String originalName = call.getString("originalName");
        String targetRelativePath = call.getString("targetRelativePath");
        if (sourceId == null || category == null || originalRelativePath == null || originalName == null || targetRelativePath == null) {
            call.reject("撤销参数不完整");
            return;
        }

        try {
            DocumentFile root = requireRoot(sourceId);
            DocumentFile categoryDir = findByRelativePath(root, categoryDirName(category));
            if (categoryDir == null || !categoryDir.isDirectory()) {
                call.reject("无法找到分类目录");
                return;
            }

            DocumentFile source = findByRelativePath(categoryDir, targetRelativePath);
            if (source == null || !source.isFile()) {
                call.reject("无法读取分类目录中的照片");
                return;
            }

            DocumentFile originalDir = ensureSubDirs(root, directoryPart(originalRelativePath));
            String restoredName = findUniqueName(originalDir, originalName);
            DocumentFile restored = originalDir.createFile(resolveMimeType(source), restoredName);
            if (restored == null) {
                call.reject("无法创建恢复文件");
                return;
            }

            copyDocument(source, restored);
            if (!source.delete()) {
                call.reject("照片已恢复到原目录，但分类目录中的文件删除失败，请手动清理");
                return;
            }

            notifyChanged(root.getUri());
            notifyChanged(restored.getUri());

            JSObject response = new JSObject();
            response.put("restoredPhoto", toPhoto(restored, joinRelative(directoryPart(originalRelativePath), safeName(restored, restoredName))));
            call.resolve(response);
        } catch (Exception e) {
            call.reject("撤销失败", e);
        }
    }

    private void scanDirectory(DocumentFile dir, String currentPath, JSArray photos) {
        DocumentFile[] files = dir.listFiles();
        Arrays.sort(files, (a, b) -> safeName(a, "").compareToIgnoreCase(safeName(b, "")));

        for (DocumentFile file : files) {
            String name = file.getName();
            if (name == null) continue;
            if (file.isDirectory()) {
                if (EXCLUDED_DIRS.contains(name)) continue;
                scanDirectory(file, joinRelative(currentPath, name), photos);
                continue;
            }

            if (file.isFile() && isPhotoFile(name)) {
                photos.put(toPhoto(file, joinRelative(currentPath, name)));
            }
        }
    }

    private JSObject toPhoto(DocumentFile file, String relativePath) {
        JSObject photo = new JSObject();
        String name = safeName(file, relativePath);
        photo.put("id", file.getUri().toString());
        photo.put("uri", file.getUri().toString());
        photo.put("name", name);
        photo.put("relativePath", relativePath);
        photo.put("size", Math.max(0L, file.length()));
        photo.put("lastModified", Math.max(0L, file.lastModified()));
        photo.put("mimeType", resolveMimeType(file));
        return photo;
    }

    private DocumentFile requireRoot(String sourceId) throws Exception {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(sourceId));
        if (root == null || !root.isDirectory() || !root.canRead() || !root.canWrite()) {
            throw new Exception("Android 目录授权已失效，请重新选择照片目录");
        }
        return root;
    }

    private DocumentFile findByRelativePath(DocumentFile root, String relativePath) {
        if (relativePath.isEmpty()) return root;
        DocumentFile current = root;
        for (String part : relativePath.split("/")) {
            if (part.isEmpty()) continue;
            current = current.findFile(part);
            if (current == null) return null;
        }
        return current;
    }

    private DocumentFile ensureSubDirs(DocumentFile root, String dirPath) throws Exception {
        DocumentFile current = root;
        if (dirPath.isEmpty()) return current;

        for (String part : dirPath.split("/")) {
            if (part.isEmpty()) continue;
            current = ensureDirectory(current, part);
        }
        return current;
    }

    private DocumentFile ensureDirectory(DocumentFile parent, String name) throws Exception {
        DocumentFile existing = parent.findFile(name);
        if (existing != null && existing.isDirectory()) return existing;
        DocumentFile created = parent.createDirectory(name);
        if (created == null) throw new Exception("无法创建目录: " + name);
        return created;
    }

    private String findUniqueName(DocumentFile dir, String baseName) {
        if (dir.findFile(baseName) == null) return baseName;

        int dot = baseName.lastIndexOf('.');
        String prefix = dot == -1 ? baseName : baseName.substring(0, dot);
        String ext = dot == -1 ? "" : baseName.substring(dot);
        for (int i = 1; i <= 999; i++) {
            String candidate = prefix + "_" + i + ext;
            if (dir.findFile(candidate) == null) return candidate;
        }
        return prefix + "_" + Long.toString(System.currentTimeMillis(), 36) + ext;
    }

    private void copyDocument(DocumentFile source, DocumentFile target) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        try (
            InputStream input = resolver.openInputStream(source.getUri());
            OutputStream output = resolver.openOutputStream(target.getUri(), "w")
        ) {
            if (input == null || output == null) throw new Exception("无法打开文件流");
            byte[] buffer = new byte[1024 * 256];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }
    }

    private Bitmap decodeScaledBitmap(Uri uri, int maxSize) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = resolver.openInputStream(uri)) {
            BitmapFactory.decodeStream(input, null, bounds);
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, maxSize);
        Bitmap decoded;
        try (InputStream input = resolver.openInputStream(uri)) {
            decoded = BitmapFactory.decodeStream(input, null, options);
        }

        if (decoded == null) return null;
        int width = decoded.getWidth();
        int height = decoded.getHeight();
        if (width <= maxSize && height <= maxSize) return decoded;

        float ratio = Math.min((float) maxSize / width, (float) maxSize / height);
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)), true);
        decoded.recycle();
        return scaled;
    }

    private int computeInSampleSize(int width, int height, int maxSize) {
        int sample = 1;
        while (width / sample > maxSize * 2 || height / sample > maxSize * 2) {
            sample *= 2;
        }
        return sample;
    }

    private String categoryDirName(String category) {
        switch (category) {
            case "delete": return "_delete_review";
            case "keep": return "_keep";
            case "stash": return "_stash";
            case "favorite": return "_favorite";
            default: return "_stash";
        }
    }

    private String directoryPart(String relativePath) {
        int idx = relativePath.lastIndexOf('/');
        if (idx == -1) return "";
        return relativePath.substring(0, idx);
    }

    private String joinRelative(String left, String right) {
        if (left == null || left.isEmpty()) return right == null ? "" : right;
        if (right == null || right.isEmpty()) return left;
        return left + "/" + right;
    }

    private boolean isPhotoFile(String name) {
        int dot = name.lastIndexOf('.');
        if (dot == -1) return false;
        return PHOTO_EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private String resolveMimeType(DocumentFile file) {
        String type = file.getType();
        return type == null || type.isEmpty() ? "image/jpeg" : type;
    }

    private String safeName(DocumentFile file, String fallback) {
        String name = file.getName();
        return name == null || name.isEmpty() ? fallback : name;
    }

    private void notifyChanged(Uri uri) {
        getContext().getContentResolver().notifyChange(uri, null);
    }
}
