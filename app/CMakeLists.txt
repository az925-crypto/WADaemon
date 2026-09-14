cmake_minimum_required(VERSION 3.22.1)
project(wadaemon)

add_library(native-lib SHARED src/main/cpp/native-lib.cpp)

# Header libnode (app/libnode/include) diunduh di CI, bukan di-commit.
# Dua include dir: "node/node.h" butuh yang pertama, "v8config.h" (di-include
# dari node/cppgc/common.h tanpa prefix node/) butuh yang kedua.
target_include_directories(native-lib PRIVATE
        ${CMAKE_SOURCE_DIR}/libnode/include
        ${CMAKE_SOURCE_DIR}/libnode/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION
        ${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so)

target_link_libraries(native-lib libnode log)
