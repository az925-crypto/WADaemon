cmake_minimum_required(VERSION 3.22.1)
project(wadaemon)

add_library(native-lib SHARED src/main/cpp/native-lib.cpp)

# Header libnode (app/libnode/include) diunduh di CI, bukan di-commit.
target_include_directories(native-lib PRIVATE ${CMAKE_SOURCE_DIR}/libnode/include)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION
        ${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so)

target_link_libraries(native-lib libnode log)
