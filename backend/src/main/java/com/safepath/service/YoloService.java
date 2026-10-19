package com.safepath.service;

import com.safepath.dto.YoloResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Service
public class YoloService {

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

        try {

            ByteArrayResource resource = new ByteArrayResource(
                    file.getBytes()
            ) {
                @Override
                public String getFilename() {
                    return file.getOriginalFilename();
                }
            };

            MultiValueMap<String, Object> body =
                    new LinkedMultiValueMap<>();

            body.add("file", resource);

            return restClient.post()
                    .uri("/detect-image")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(YoloResponse.class);

        } catch (IOException e) {
            throw new RuntimeException(
                    "Could not read image for YOLO detection",
                    e
            );
        }
    }
}