module.exports = {
  dependency: {
    platforms: {
      ios: null,
      android: {
        packageImportPath: 'import dev.testerswarm.reactnative.TesterSwarmPackage;',
        packageInstance: 'new TesterSwarmPackage()',
      },
    },
  },
};
