package com.safepath.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthResponse {

    private String id;
    private String name;
    private String email;
    private String phone;
    private String avatar;
    private String role;
    private String token;
}