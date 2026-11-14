module.exports = {
  dependency: {
    platforms: {
      ios: null,
      android: {
        packageImportPath: 'import io.testerloop.reactnative.TesterLoopPackage;',
        packageInstance: 'new TesterLoopPackage()',
      },
    },
  },
};
