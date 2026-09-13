#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include "node/node.h"

// Jembatan JNI -> node::Start (pola resmi nodejs-mobile).
// Hanya boleh dipanggil SEKALI per proses dari satu background thread:
// runtime Node tidak bisa di-restart (lihat NodeRunner.kt).
extern "C" jint JNICALL
Java_com_zaaaam_wadaemon_NodeRunner_startNodeWithArguments(
        JNIEnv *env,
        jobject /* this */,
        jobjectArray arguments) {
    jsize argument_count = env->GetArrayLength(arguments);

    int c_arguments_size = 0;
    for (int i = 0; i < argument_count; i++) {
        jstring s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        c_arguments_size += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
        env->DeleteLocalRef(s);
    }

    char *args_buffer = (char *) calloc((size_t) c_arguments_size, sizeof(char));
    char **argv = (char **) malloc(sizeof(char *) * (size_t) argument_count);
    char *pos = args_buffer;
    for (int i = 0; i < argument_count; i++) {
        jstring s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        strncpy(pos, c, strlen(c));
        argv[i] = pos;
        pos += strlen(pos) + 1;
        env->ReleaseStringUTFChars(s, c);
        env->DeleteLocalRef(s);
    }

    int result = node::Start(argument_count, argv);
    free(argv);
    free(args_buffer);
    return (jint) result;
}
