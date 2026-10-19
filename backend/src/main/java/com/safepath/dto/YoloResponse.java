package com.safepath.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class YoloResponse {

    private Boolean detected;
    private Integer count;
    private List<YoloDetection> detections;
}