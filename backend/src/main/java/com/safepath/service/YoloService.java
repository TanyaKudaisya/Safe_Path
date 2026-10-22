package com.safepath.service;

import com.safepath.dto.YoloResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

@Service
public class YoloService {

    private static final Logger log = LoggerFactory.getLogger(YoloService.class);

    /** Longest side sent to YOLO. The model works at 640px, so larger photos only cost time and memory. */
    private static final int MAX_SIDE = 1024;

    private final RestClient restClient;

    public YoloService(
            RestClient.Builder restClientBuilder,
            @Value("${yolo.service-url}") String yoloServiceUrl
    ) {
        this.restClient = restClientBuilder
                .baseUrl(yoloServiceUrl)
                .build();
    }

    public YoloResponse detectImage(MultipartFile file) {
        final byte[] bytes;
        try {
            bytes = shrink(file.getBytes());
        } catch (IOException e) {
            throw new RuntimeException("Could not read image for YOLO detection", e);
        }

        ByteArrayResource resource = new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return "image.jpg";
            }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", resource);

        // A sleeping/restarting YOLO service answers 502/503/504 from the host's proxy: retry once.
        for (int attempt = 1; ; attempt++) {
            long start = System.currentTimeMillis();
            try {
                YoloResponse response = restClient.post()
                        .uri("/detect-image")
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(body)
                        .retrieve()
                        .body(YoloResponse.class);
                log.info("YOLO answered in {} ms (sent {} KB, attempt {})",
                        System.currentTimeMillis() - start, bytes.length / 1024, attempt);
                return response;
            } catch (HttpServerErrorException e) {
                int code = e.getStatusCode().value();
                log.warn("YOLO returned {} after {} ms (sent {} KB, attempt {})",
                        code, System.currentTimeMillis() - start, bytes.length / 1024, attempt);
                boolean transientError = code == 502 || code == 503 || code == 504;
                if (attempt >= 2 || !transientError) {
                    throw e;
                }
                try {
                    Thread.sleep(4000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    /** Downscales to MAX_SIDE and re-encodes as JPEG. Returns the original bytes if it cannot be decoded. */
    static byte[] shrink(byte[] original) {
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(original));
            if (src == null) {
                return original;
            }
            int w = src.getWidth();
            int h = src.getHeight();
            double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(w, h));
            int nw = Math.max(1, (int) Math.round(w * scale));
            int nh = Math.max(1, (int) Math.round(h * scale));

            BufferedImage rgb = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgb.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(src, 0, 0, nw, nh, java.awt.Color.WHITE, null);
            g.dispose();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!ImageIO.write(rgb, "jpg", out)) {
                return original;
            }
            byte[] result = out.toByteArray();
            return result.length < original.length || scale < 1.0 ? result : original;
        } catch (Exception e) {
            return original;
        }
    }
}
