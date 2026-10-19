package com.safepath.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    // http://host:8080/admin  ->  /admin/  ->  static/admin/index.html
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // must redirect (not forward): the page loads admin.js / admin.css by relative
        // path, which only resolves correctly when the browser URL ends in /admin/
        registry.addRedirectViewController("/admin", "/admin/");
        registry.addViewController("/admin/").setViewName("forward:/admin/index.html");
    }
}
