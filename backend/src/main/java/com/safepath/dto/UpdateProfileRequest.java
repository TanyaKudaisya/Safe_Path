package com.safepath.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

/** Body of PUT /api/auth/update. Any field left out is unchanged. */
@Data
@NoArgsConstructor
public class UpdateProfileRequest {

    private String name;
    private String phone;
    private String avatar;
}
